import * as functions from 'firebase-functions';    //Firebase functions
import * as admin from 'firebase-admin';            //For cross access (using RTDB in storage)
import pathModule = require('path');                //Path operations
import osModule = require('os');                    //Facilitates temporary file systems
import fsModule = require('fs');                    //File stream module
import { CirrusService, Ticket } from "./models";   //Models I defined

//Initialize admin configuration
admin.initializeApp(functions.config().firebase);

//Generates push notes for delivery ticket updates triggered by uploads to cloud storage.
exports.alertDelivery = functions.region('us-central1').storage.object().onFinalize(object =>
{
    const fileBucket = object.bucket;                   //Storage bucket that contains the file
    const filePath = object.name;                       //Path to the file within the bucket
    const fileName = pathModule.basename(filePath);     //Name of the file
    let payload = null;                                 //Push note payload
    let options = null;                                 //Push note options
    let title = "";                                     //The title of the push note
    let body = "";                                      //Body text for the push note

    //If it's not a delivery don't do anything
    if (!filePath.toLowerCase().includes("delivery"))
    {
        return null;
    }
    //Download the file
    const bucket = admin.storage().bucket(fileBucket);
    const tempFilePath = pathModule.join(osModule.tmpdir(), fileName);
    return bucket.file(filePath).download({
        destination: tempFilePath
    }).then(() =>
    {
        //Read the entire file into memory
        const fileContent = fsModule.readFileSync(tempFilePath, 'utf8');

        //Parse information from the ticket
        const parsedTicket = parseTLKACTicketRawString(fileContent);
        parsedTicket.storageLocation = filePath;

        //Do an additional check
        if (parsedTicket.orderType !== "Delivery")
        {
            return null;
        }
        //Build the body
        body += parsedTicket.customerRemarks + "\r\n";
        if (parsedTicket.customerName !== null && parsedTicket.customerName !== "")
        {
            body += "For: " + parsedTicket.customerName + "\r\n";
        }
        if (parsedTicket.phone !== null && parsedTicket.phone !== "")
        {
            body += "Phone: " + parsedTicket.phone;
        }
        //Build the title
        if (parsedTicket.streetAddress !== null)
        {
            title = parsedTicket.streetAddress;
        }
        if (parsedTicket.city !== null)
        {
            title += ", " + parsedTicket.city;
        }
        let remarks = ""
        if (!parsedTicket.customerRemarks)
        {
            remarks = parsedTicket.customerRemarks
        }
        //Build the push note payload
        payload = {
            notification: {
                click_action: "DeliveryCategory",
                title: title,
                body: body,
                sound: "thermalprintersound.aiff"
            },
            data: {
                "address": parsedTicket.streetAddress,
                "city": parsedTicket.city,
                "remarks": remarks,
                "customer": parsedTicket.customerName,
                "phone": parsedTicket.phone,
                "inception": parsedTicket.ticketInception
            }
        }
        options = {
            priority: "high",
            timeToLive: 60 * 60 * 2
        }
        //Create the date for the reference
        let dateStr = "serverDate-"
            + getFormattedFirebaseDirectoryDateStringFrom(Date.now().toString());
        if (parsedTicket.ticketInception !== null)
        {
            dateStr = getFormattedFirebaseDirectoryDateStringFrom(parsedTicket.ticketInception);
        }
        if (parsedTicket.ticketNum !== null)
        {
            //Write to the database
            return admin.database().ref("deliveries/" + dateStr + parsedTicket.ticketNum)
                .set(parsedTicket);
        }
        else
        {
            //If there's nothing, don't do anything
            return null;
        }
    }).then(() =>
    {
        if (payload === null || options === null)
        {
            return null;
        }
        //Push the notification out
        return admin.messaging().sendToTopic("PushNoteTopic", payload, options);
    }).then(() =>
    {
        //Update the last push notification
        return admin.database().ref("lastPushNote/").set(payload);
    }).then(() => fsModule.unlinkSync(tempFilePath));
})

//Endpoint to push the last push notification again.
//https://us-central1-tlkac-api.cloudfunctions.net/pushLastPushNoteAgain
exports.pushLastPushNoteAgain = functions.https.onRequest((req, res) =>
{
    return admin.database().ref("lastPushNote/").once('value', (snapshot) =>
    {
        const lastNote = snapshot.val();
        const options = {
            priority: "high",
            timeToLive: 60 * 60 * 2
        };
        if (lastNote.notification !== null)
        {
            res.status(200).json({
                message: "Previous push notification sent out again"
            });
            return admin.messaging().sendToTopic("PushNoteTopic", lastNote, options);
        }
        else
        {
            res.status(200).json({
                message: "No previous push notification exists"
            });
            return null;
        }
    });
})

//Endpoint for logging.
//https://us-central1-tlkac-api.cloudfunctions.net/log
exports.log = functions.https.onRequest((req, res) =>
{
    const logForDB = {
        date: req.body.timestamp,
        log: req.body.log
    };
    //Write to the db but in chronological order
    return admin.database().ref("log/" + new Date().getTime().toString()).set(logForDB).then(() =>
    {
        res.status(200).send();
    });
});

//Endpoint for the heartbeats of devices that support service infrastructure.
//https://us-central1-tlkac-api.cloudfunctions.net/hearbeat
exports.hearbeat = functions.https.onRequest((req, res) =>
{
    let service: CirrusService = null;
    const rawSvcString: string = req.body.service;
    if (rawSvcString !== null)
    {
        service = CirrusService[rawSvcString];
    }
    if (!service)
    {
        service = CirrusService.unspecified;
    }
    const heartbeatForDB = {
        localTime: req.body.localTime,
        account: req.body.account
    };
    const dbPath = "hearbeats/" + service + "/" + heartbeatForDB.account
    return admin.database().ref(dbPath).set(heartbeatForDB.localTime).then(() =>
    {
        res.status(200).send();
    });
});

//Endpoint to ask for a specific delivery order's push notification.

exports.sendSpecificOrderPushNote = functions.https.onRequest((req, res) =>
{
    //Create the date for the reference
    const date = new Date();
    const dateStr = (date.getDate()).toString() + "-" + (date.getMonth() + 1).toString()
        + "-" + (date.getFullYear()).toString() + "/";
    return admin.database().ref("deliveries/" + dateStr + req.query.order).once('value', (snap) =>
    {
        if (snap.val() === null)
        {
            return null;
        }
        const filePath = snap.val();                        //Path to the file within the bucket
        const fileName = pathModule.basename(filePath);     //Name of the file
        let payload = null;
        let options = null;

        const bucket = admin.storage().bucket();
        const tempFilePath = pathModule.join(osModule.tmpdir(), fileName);
        return bucket.file(filePath).download({
            destination: tempFilePath
        }).then(() =>
        {
            //Perform parsing here
            const fileContent = fsModule.readFileSync(tempFilePath, 'utf8');    //Read all
            const parsedTicket = parseTLKACTicketRawString(fileContent);
            let title = "";
            let body = "";

            //Build the body
            if (parsedTicket.customerRemarks !== null && parsedTicket.customerRemarks !== "")
            {
                body += parsedTicket.customerRemarks + "\r\n";
            }
            if (parsedTicket.customerName !== null && parsedTicket.customerName !== "")
            {
                body += "Customer: " + parsedTicket.customerName + "\r\n";
            }
            if (parsedTicket.phone !== null && parsedTicket.phone !== "")
            {
                body += "Phone: " + parsedTicket.phone;
            }
            //Build the title
            if (parsedTicket.streetAddress !== null && parsedTicket.streetAddress !== "")
            {
                title = parsedTicket.streetAddress;
            }
            if (parsedTicket.city !== null && parsedTicket.city !== "")
            {
                if (title === "")
                {
                    title = parsedTicket.city;
                }
                else
                {
                    title += ", " + parsedTicket.city;
                }
            }
            //If the title is still blank
            if (title === "")
            {
                title = "Delivery Order (Address Missing)"
            }
            //Build the push note payload
            payload = {
                notification: {
                    click_action: "DeliveryCategory",
                    title: title,
                    body: body,
                    sound: "thermalprintersound.aiff"
                },
                data: {
                    "address": parsedTicket.streetAddress,
                    "city": parsedTicket.city,
                    "remarks": parsedTicket.customerRemarks,
                    "customer": parsedTicket.customerName,
                    "phone": parsedTicket.phone,
                    "inception": parsedTicket.ticketInception
                }
            }
            options = {
                priority: "high",
                timeToLive: 60 * 60 * 2
            }
            return admin.messaging().sendToTopic("PushNoteTopic", payload, options);
        }).then(() =>
        {
            return admin.database().ref("lastPushNote/").set(payload);
        }).then(() =>
        {
            fsModule.unlinkSync(tempFilePath);
            res.status(200).send();
        });
    });
})

// exports.sendLatestFileUploadPushNote = functions.storage.object().onFinalize(event => {
//     const raw = event.name;     //Raw file path
//     let ticketKind = null;      //Space for the ticket kind string
//     let fileName = null;        //Space for the file name
//     let noteTitle = null;       //The title of the notification

//     //Isolate the filename
//     const splitRaw = raw.split("/");
//     if (splitRaw.length > 0) {  //Make sure not empty
//         fileName = splitRaw[splitRaw.length - 1];
//     }
//     if (fileName !== null) {
//         //Grab the ticket kind
//         const splitName = fileName.split(".");
//         if (splitName.length > 0) {
//             const name = raw.split(".")[0];
//             const split = name.split("_");
//             if (split.length > 1) {
//                 ticketKind = split[1];
//             }
//         }
//     }
//     if (ticketKind !== null) {
//         //Reformat the ticket string if necessary
//         if (ticketKind === "DineIn") {
//             ticketKind = "Dine In"
//         }
//         else if (ticketKind === "Take-out") {
//             ticketKind = "Take Out"
//         }
//         else if (ticketKind === "PhoneOrder") {
//             ticketKind = "Phone"
//         }
//     }
//     if (ticketKind === null) {
//         noteTitle = "Null Ticket"
//     }
//     else {
//         noteTitle = ticketKind
//     }

//     const payload = {
//         notification: {
//             title: noteTitle,
//             body: event.name    //Give full path so clients know where to look in the cloud
//         }
//     }
//     const options = {
//         priority: "high",
//         timeToLive: 60 * 60 * 2
//     }
//     return admin.messaging().sendToTopic("Latest_Ticket", payload, options);
// })

function parseTLKACTicketRawString(rawStr)
{
    //Validate parameter type
    if (typeof rawStr !== 'string')
    {
        return null;
    }
    const lines = rawStr.split("\n");  //Split into lines
    let ticketNum: string = null;
    let orderType: string = null;
    let customerName: string = null;
    let phone: string = null;
    let streetAddress: string = null;
    let city: string = null;
    let customerRemarks: string = null;
    let ticketInception: string = null;

    //Validate it's a ticket from TLKAC
    if (lines.length < 1 || !lines[0].includes("The Little Kitchen"))
    {
        return null;
    }
    //Line 7 has the order number and order type
    if (lines.length > 7)
    {
        //Remove everything except numbers
        ticketNum = lines[7].replace(/\D/g, '');

        //RegX the type of order
        const possOrderMatches = lines[7].match('(Delivery)|(Take-out)|(Phone)|(Dine In)');
        let rawOrderStr = "";
        if (possOrderMatches !== null && possOrderMatches.length > 0)
        {
            rawOrderStr = possOrderMatches[0].toString();
        }
        //Corrections
        switch (rawOrderStr)
        {
            case "Take-out":
                {
                    rawOrderStr = "Take Out";
                    break;
                }
            case "Phone Order":
                {
                    rawOrderStr = "Phone";
                    break;
                }
            default:
                {
                    break;
                }
        }
        orderType = rawOrderStr;
    }
    //Line 8 has customer phone and name if not a dine in or take out order
    if (lines.length > 8 && orderType !== "Take Out" && orderType !== "Dine In")
    {
        const custInfo = lines[8].split("  ");                  //Split based on consecutive spaces
        if (custInfo.length > 0)
        {
            phone = custInfo[0].trim();                         //Phone is on the far left
        }
        customerName = custInfo[custInfo.length - 1].trim();    //Name is on the far right
        if (customerName === phone)
        {
            customerName = null;                                //Clear name in awry case
        }
    }
    //Line 9 has the address if it's a delivery
    if (lines.length > 9 && orderType === "Delivery")
    {
        const addressRaw = lines[9];
        const addressSplit = lines[9].split("  ");              //Split based on consecutive spaces

        if (addressSplit.length > 1)
        {
            //Street address is everything before the last element
            streetAddress = ""  //Reset first, then build
            for (let x = 0; x < addressSplit.length - 1; x++)
            {
                streetAddress += addressSplit[x]
            }
            city = addressSplit[addressSplit.length - 1]  //City is the last element
        }
        else 
        {
            //Can't discern where the city starts, so just put the entire thing in the street
            streetAddress = addressRaw
            city = ""
        }
        //If city ends up being the same as address, then forget the city
        if (city === streetAddress)
        {
            city = "";
        }
        //Clean up
        if (streetAddress !== null)
        {
            streetAddress = streetAddress.trim();
            streetAddress = streetAddress.replace("  ", " ")
        }
        if (city !== null)
        {
            city = city.trim();
            city = city.replace("  ", " ")
        }
    }
    //Line 12 has customer remarks if it's a delivery
    if (lines.length > 12 && orderType === "Delivery")
    {
        const remarksLine = lines[12];
        if (remarksLine.includes("Remarks:") || remarksLine.includes("Cross Street"))
        {
            customerRemarks = remarksLine.replace('\r', '');

            //Build the rest of the remarks
            let current = 13;
            while (current < lines.length)
            {
                if (lines[current].includes("--------------------------------------"))
                {
                    current = lines.length; //Stop because the delimiter has been reached
                }
                else
                {
                    customerRemarks += "\n" + lines[current].replace('\r', '');
                    current += 1;
                }
            }
        }
    }
    if (!customerRemarks)
    {
        customerRemarks = ""
    }
    //There's a time stamp somewhere near the bottom of the ticket. It's not consistent, so regex
    const possMatches = rawStr.match("\\d+\\/\\d+\\/\\d+ \\d+:\\d+:\\d+ (AM|PM)")
    if (possMatches !== null && possMatches.length > 0)
    {
        ticketInception = possMatches[0].toString();
    }
    const retVal = new Ticket();
    retVal.ticketNum = ticketNum;
    retVal.orderType = orderType;
    retVal.customerName = customerName;
    retVal.phone = phone;
    retVal.streetAddress = streetAddress;
    retVal.city = city;
    retVal.customerRemarks = customerRemarks;
    retVal.ticketInception = ticketInception;
    return retVal;
}

function getFormattedFirebaseDirectoryDateStringFrom(dateIn: string)
{
    const date = new Date(dateIn);
    return date.getDate().toString()
        + "-" + (date.getMonth() + 1).toString()          //Months start at 0 for some reason
        + "-" + (date.getFullYear()).toString() + "/";
}
