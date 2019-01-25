import fs = require('fs')
import ReadLine = require('readline')
import Stream = require('stream')
import { CirrusService, Ticket } from "./models";
import { isNullOrUndefined } from 'util';

export class SVCTicketParse
{
    /**
     * Markers are lines that look like "------...".
     * 0 means there has been no parsed marker yet.
     */
    private markerNumber = 0
    /**
     * A parsed line means that line was processed and valid information was parsed out.
     * This is necessary because sometimes tickets will be double spaced, so counting line numbers
     * doesn't work.
     */
    private linesParsedSinceLastMarker = 0
    private deliveryNoteBuild = null

    constructor() {}

    parseTicketFromFile(path: string): Promise<Ticket>
    {
        return new Promise((success, failure) =>
        {
            var lineReader: ReadLine.Interface
            var ticketBuild: Ticket = new Ticket()
            var dataWasParsedOut = false
            var currentLineIsAMarkerLine = false
            var deliveryNoteExists: boolean = null 

            //Attempt to initialize a line reader
            try
            {
                lineReader = SVCTicketParse.lineReaderFor(SVCTicketParse.readStreamForFile(path))
            }
            catch (err)
            {
                failure(err)
                return
            }
            //Read each line until end of file is reached (on close event)
            lineReader
                .on('line', line => 
                {
                    //Ticket data order might change any time, so even though this is inefficient, 
                    //there's a chance this logic might still hold
                    currentLineIsAMarkerLine = this.identifyPossibleMarker(line)

                    //Customer remarks are built between the 2nd and third marker lines.
                    //LOGIC HERE FAST EXITS, SO KEEP THAT IN MIND BEFORE YOU PUT ANY OTHER LOGIC
                    //ABOVE THIS.
                    if (this.markerNumber === 2 && ticketBuild.orderType === "Delivery" &&
                        !currentLineIsAMarkerLine && 
                        (deliveryNoteExists === null || deliveryNoteExists))
                    {
                        this.parseDeliveryNotesFrom(line)
                        if (isNullOrUndefined(this.deliveryNoteBuild))
                        {
                            deliveryNoteExists = false
                            ticketBuild.customerRemarks = null
                            return
                        }
                        if (isNullOrUndefined(ticketBuild.customerRemarks))
                        {
                            ticketBuild.customerRemarks = ""
                        }
                        //Trimming avoids the final new line
                        ticketBuild.customerRemarks = this.deliveryNoteBuild.trim()
                        dataWasParsedOut = true
                        return  //Fast exit until next marker number is attained
                    }
                    if (!dataWasParsedOut && isNullOrUndefined(ticketBuild.employeeName))
                    {
                        ticketBuild.employeeName = SVCTicketParse.parseNameEmployeeFrom(line)
                        dataWasParsedOut = true
                    }
                    if (!dataWasParsedOut && (isNullOrUndefined(ticketBuild.ticketNum) ||
                        isNullOrUndefined(ticketBuild.orderType)))
                    {
                        var tuple = SVCTicketParse.parseTicketNumberAndTypeFrom(line)
                        if (!isNullOrUndefined(tuple))
                        {
                            ticketBuild.ticketNum = tuple[0]
                            ticketBuild.orderType = tuple[1]
                            dataWasParsedOut = true
                        }
                    }
                    if (!dataWasParsedOut && (isNullOrUndefined(ticketBuild.customerName) ||
                        isNullOrUndefined(ticketBuild.phone)))
                    {
                        var tuple = SVCTicketParse.parsePhoneAndNameCustFrom(line)
                        if (!isNullOrUndefined(tuple))
                        {
                            ticketBuild.phone = tuple[0]
                            ticketBuild.customerName = tuple[1]
                            dataWasParsedOut = true
                        }
                    }
                    if (!dataWasParsedOut && this.markerNumber === 1 && 
                        this.linesParsedSinceLastMarker === 3)
                    {
                        var tuple = SVCTicketParse.parseStreetAndCityFrom(line)
                        if (!isNullOrUndefined(tuple))
                        {
                            ticketBuild.streetAddress = tuple[0]
                            ticketBuild.city = tuple[1]
                            dataWasParsedOut = true
                        }
                    }
                    if (!dataWasParsedOut && isNullOrUndefined(ticketBuild.orderTotal))
                    {
                        ticketBuild.orderTotal = SVCTicketParse.parseOrderTotalFrom(line)
                        dataWasParsedOut = true
                    }
                    if (!dataWasParsedOut && this.markerNumber > 1 && 
                        isNullOrUndefined(ticketBuild.ticketInception))
                    {
                        ticketBuild.ticketInception = SVCTicketParse.parseTicketTimeStampFrom(line)
                        dataWasParsedOut = true
                    }
                    if (dataWasParsedOut)
                    {
                        dataWasParsedOut = false
                        this.linesParsedSinceLastMarker += 1
                    }
                })
                .on('close', () => 
                {
                    success(ticketBuild)
                    return
                })
                .on('SIGCONT', () => 
                {
                    failure(Error("Encountered SIGCONT during line reads"))
                })
                .on('SIGINT', () =>
                {
                    failure(Error("Encountered SIGINT during line reads"))
                })
                .on('SIGTSTP', () => 
                {
                    failure(Error("Encountered SIGTSTP during line reads"))
                })
        })
    }

    private static parseTicketTimeStampFrom(line: string): string 
    {
        const stampRegEx = "\\d+\\/\\d+\\/\\d+ \\d+:\\d+:\\d+ (AM|PM)"
        const matches = line.match(stampRegEx)
        if (!isNullOrUndefined(matches) && matches.length > 0)
        {
            return matches[0]
        }
        return null
    }

    private static parseOrderTotalFrom(line: string): string 
    {
        if (!line.includes("AMOUNT DUE: "))
        {
            return null
        }
        const moneyRegEx = "\\$\\d+.\\d+"
        const match = line.match(moneyRegEx)
        return match[0]
    }

    private parseDeliveryNotesFrom(line: string)
    {
        //On the first time this is called
        if (isNullOrUndefined(this.deliveryNoteBuild))
        {
            //Check to see if there is the note actually exists
            if (!line.startsWith("Cross Street:") && !line.startsWith("Remarks:"))
            {
                return null
            }
            //Initialize so it exists
            this.deliveryNoteBuild = ""
        }
        this.deliveryNoteBuild += line + "\n"
    }

    private static parseStreetAndCityFrom(line: string): [string, string]
    {
        const split = line.split("  ")  //Split based on double spaces
        var street = ""
        var city = ""
        if (!isNullOrUndefined(split))
        {
            //Sometimes there may be a typo in the address where two spaces are consecutive.
            //To handle this, make the city the last section and the street the rest.
            const sections = split.length
            if (sections > 1)
            {
                for (var x = 0; x < sections - 2; x++)
                {
                    street += split[x].trim()
                    if (x != sections - 2)
                    {
                        street += " "
                    }
                }
                city = split[sections - 1]
            }
            else 
            {
                street = sections[0]
            }
            return [street.trim(), city.trim()]
        }
        return null
    }

    private static parsePhoneAndNameCustFrom(line: string): [string, string]
    {
        const phoneRegEx = "\\(\\d{3}\\) \\d{3}-\\d{4}"
        const matches = line.match(phoneRegEx)

        //A match must exist, there must only be 1 match, match must start at the beginning,
        //the # of characters in the line has be longer than just the phone
        if (isNullOrUndefined(matches) || matches.length != 1 ||
            !line.startsWith(matches[0]) || line.length < matches[0].length)
        {
            return null //Fast fail
        }
        const lineWithoutPhone = line.substr(matches[0].length)
        return [matches[0], lineWithoutPhone.trim()]
    }

    private static parseTicketNumberAndTypeFrom(line: string): [string, string]
    {
        if (!line.startsWith("Order #: "))
        {
            return null
        }
        //Find the order number
        var startIndex = 9
        var orderNumberEndIndexSearch = startIndex
        while (line[orderNumberEndIndexSearch] !== " ")
        {
            orderNumberEndIndexSearch++
        }
        var orderNumber = line.substr(startIndex, orderNumberEndIndexSearch - startIndex)

        //Find ticket type
        var endIndex = line.length - 1
        if (line[endIndex] === " ")
        {
            //Only search for end index if there is whitespace at the end of the line
            while (line[endIndex] !== " " && endIndex > orderNumberEndIndexSearch)
            {
                endIndex--
            }
        }
        startIndex = endIndex   //Reuse startIndex
        while (line[startIndex] !== " " && startIndex > orderNumberEndIndexSearch)
        {
            startIndex--
        }
        startIndex++    //Don't start on whitespace
        var lengthTickType = endIndex - startIndex + 1
        var ticketType: string
        if (lengthTickType < 0)
        {
            ticketType = null
        }
        else 
        {
            ticketType = line.substr(startIndex, lengthTickType)
        }
        return [orderNumber, ticketType]
    }

    private static parseNameEmployeeFrom(line: string): string 
    {
        if (!line.includes("EServer: "))
        {
            return null
        }
        var startIndex = line.indexOf(": ") + 2                 //Start right after first colon
        var endIndexSearch = line.lastIndexOf("Station: ") - 1  //End start just before "Station"

        //Search backwards from start of "Station: " and find the first non space character
        //but make sure it does not continue forever
        while (line[endIndexSearch] === " " && endIndexSearch > startIndex - 1)
        {
            endIndexSearch--
        }
        //Minus one because length calculation is lower bound inclusive 0
        if (endIndexSearch < startIndex - 1)
        {
            return null
        }
        //Plus one to convert index to length
        return line.substr(startIndex, endIndexSearch - startIndex + 1)
    }

    private identifyPossibleMarker(line: string): boolean
    {
        if (line.includes("--------------------------"))
        {
            this.markerNumber += 1
            this.linesParsedSinceLastMarker = 0
            return true
        }
        return false
    }

    private static readStreamForFile(atPath: string): fs.ReadStream
    {
        if (!fs.existsSync(atPath))
        {
            throw Error("This path does not exist: {atPath}")
        }
        return fs.createReadStream(atPath)
    }

    //https://stackoverflow.com/a/16013228/8462094
    private static lineReaderFor(readStream: fs.ReadStream): ReadLine.Interface
    {
        var os = new Stream.Duplex  //Writable and readable stream
        return ReadLine.createInterface({ input: readStream, output: os, terminal: false })
    }
}
