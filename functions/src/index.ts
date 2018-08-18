import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import pathModule = require('path');
import osModule = require('os');
import fsModule = require('fs');

admin.initializeApp(functions.config().firebase);

exports.alertDelivery = functions.region('us-central1').storage.object().onFinalize(object => {
    const fileBucket = object.bucket;                   //Storage bucket that contains the file
    const filePath = object.name;                       //Path to the file within the bucket
    const fileName = pathModule.basename(filePath);     //Name of the file
    let payload = null;
    let options = null;

    //If it's not a delivery don't do anything
    if (!filePath.toLowerCase().includes("delivery")) {
        return null;
    }
    //Download the file
    const bucket = admin.storage().bucket(fileBucket);
    const tempFilePath = pathModule.join(osModule.tmpdir(), fileName);
    return bucket.file(filePath).download({
        destination: tempFilePath
    }).then(() => {
        //Perform parsing here
        const fileContent = fsModule.readFileSync(tempFilePath, 'utf8');    //Read all
        const lines = fileContent.split("\n");  //Split into lines
        let title = "Delivery";
        let address = "";
        let city = "";
        let deliveryRemarks = "";
        let customer = "";
        let phone = "";
        let body = "";
        let ticketNum = null;

        //Line 7 has the order number
        if (lines.length > 7) {
            ticketNum = lines[7].replace(/\D/g, '');
        }
        //Line 8 has customer info
        if (lines.length > 8) {
            const custInfo = lines[8].split("  ");
            if (custInfo.length > 0) {
                phone = custInfo[0].trim();
            }
            customer = custInfo[custInfo.length - 1].trim();
            if (customer === phone) {
                customer = "";
            }
        }
        //Line 9 has the address
        if (lines.length > 9) {
            const addressInfo = lines[9].split("  ");

            //Make sure it's not empty
            if (addressInfo.length > 1) {
                address = addressInfo[0];
                city = addressInfo[addressInfo.length - 1]
            }
            //If city ends up being the same as address, then forget the city
            if (city === address) {
                city = "";
            }
            address = address.trim();
            city = city.trim();
        }
        //Line 12 has delivery remarks
        if (lines.length > 12) {
            const remarksLine = lines[12];
            if (remarksLine.includes("Remarks:")) {
                deliveryRemarks = remarksLine;

                //Build the rest of the remarks
                let current = 13;
                while (current < lines.length) {
                    if (lines[current].includes("--------------------------------------")) {
                        current = lines.length; //Stop because the delimiter has been reached
                    }
                    else {
                        deliveryRemarks += "\n" + lines[current];
                        current += 1;
                    }
                }
            }
        }
        //Build the body
        body += deliveryRemarks + "\r\n";
        if (customer !== "") {
            body += "Customer: " + customer + "\r\n";
        }
        if (phone !== "") {
            body += "Phone: " + phone;
        }
        //Build the title
        title = address
        if (city !== "") {
            title += ", " + city
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
                "address": address,
                "city": city,
                "remarks": deliveryRemarks,
                "customer": customer,
                "phone": phone
            }
        }
        options = {
            priority: "high",
            timeToLive: 60 * 60 * 2
        }
        //Create the date for the reference
        const date = new Date();
        const dateStr = (date.getDate()).toString() + "-" + (date.getMonth() + 1).toString()
            + "-" + (date.getFullYear()).toString() + "/";
        if (ticketNum === null) {
            return null;
        }
        else {
            return admin.database().ref("deliveries/" + dateStr + ticketNum).set(filePath);
        }
    }).then(() => {
        if (payload === null || options === null) {
            return null;
        }
        return admin.messaging().sendToTopic("PushNoteTopic", payload, options);
    }).then(() => {
        return admin.database().ref("lastPushNote/").set(payload);
    }).then(() => fsModule.unlinkSync(tempFilePath));
})

exports.pushLastPushNoteAgain = functions.https.onRequest((req, res) => {
    return admin.database().ref("lastPushNote/").once('value', (snapshot) => {
        const lastNote = snapshot.val();
        const options = {
            priority: "high",
            timeToLive: 60 * 60 * 2
        };
        if (lastNote.notification !== null) {
            res.status(200).json({
                message: "Previous push notification sent out again"
            });
            return admin.messaging().sendToTopic("PushNoteTopic", lastNote, options);
        }
        else {
            res.status(200).json({
                message: "No previous push notification exists"
            });
            return null;
        }
    });
})

exports.sendSpecificOrderPushNote = functions.https.onRequest((req, res) => {
    //Create the date for the reference
    const date = new Date();
    const dateStr = (date.getDate()).toString() + "-" + (date.getMonth() + 1).toString()
        + "-" + (date.getFullYear()).toString() + "/";
    return admin.database().ref("deliveries/" + dateStr + req.query.order).once('value', (snap) => {
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
        }).then(() => {
            //Perform parsing here
            const fileContent = fsModule.readFileSync(tempFilePath, 'utf8');    //Read all
            const lines = fileContent.split("\n");  //Split into lines
            let title = "Delivery";
            let address = "";
            let city = "";
            let deliveryRemarks = "";
            let customer = "";
            let phone = "";
            let body = "";
            let ticketNum = null;

            //Line 7 has the order number
            if (lines.length > 7) {
                ticketNum = lines[7].replace(/\D/g, '');
            }
            //Line 8 has customer info
            if (lines.length > 8) {
                const custInfo = lines[8].split("  ");
                if (custInfo.length > 0) {
                    phone = custInfo[0].trim();
                }
                customer = custInfo[custInfo.length - 1].trim();
                if (customer === phone) {
                    customer = "";
                }
            }
            //Line 9 has the address
            if (lines.length > 9) {
                const addressInfo = lines[9].split("  ");

                //Make sure it's not empty
                if (addressInfo.length > 1) {
                    address = addressInfo[0];
                    city = addressInfo[addressInfo.length - 1]
                }
                //If city ends up being the same as address, then forget the city
                if (city === address) {
                    city = "";
                }
                address = address.trim();
                city = city.trim();
            }
            //Line 12 has delivery remarks
            if (lines.length > 12) {
                const remarksLine = lines[12];
                if (remarksLine.includes("Remarks:")) {
                    deliveryRemarks = remarksLine;

                    //Build the rest of the remarks
                    let current = 13;
                    while (current < lines.length) {
                        if (lines[current].includes("--------------------------------------")) {
                            current = lines.length; //Stop because the delimiter has been reached
                        }
                        else {
                            deliveryRemarks += "\n" + lines[current];
                            current += 1;
                        }
                    }
                }
            }
            //Build the body
            body += deliveryRemarks + "\r\n";
            if (customer !== "") {
                body += "Customer: " + customer + "\r\n";
            }
            if (phone !== "") {
                body += "Phone: " + phone;
            }
            //Build the title
            title = address
            if (city !== "") {
                title += ", " + city
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
                    "address": address,
                    "city": city,
                    "remarks": deliveryRemarks,
                    "customer": customer,
                    "phone": phone
                }
            }
            options = {
                priority: "high",
                timeToLive: 60 * 60 * 2
            }
            return admin.messaging().sendToTopic("PushNoteTopic", payload, options);
        }).then(() => {
            return admin.database().ref("lastPushNote/").set(payload);
        }).then(() => fsModule.unlinkSync(tempFilePath));
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
