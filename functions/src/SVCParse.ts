import fs = require('fs')
import ReadLine = require('readline')
import Stream = require('stream')
import { CirrusService, Ticket } from "./models";
import { isNullOrUndefined } from 'util';
import { start } from 'repl';

export class SVCTicketParse
{
    static parseTicketFromFile(path: string): Promise<Ticket>
    {
        return new Promise((success, failure) =>
        {
            var lineReader: ReadLine.Interface
            var ticketBuild: Ticket = new Ticket()

            //Attempt to initialize a line reader
            try
            {
                lineReader = this.lineReaderFor(this.readStreamForFile(path))
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
                    if (isNullOrUndefined(ticketBuild.employeeName))
                    {
                        ticketBuild.employeeName = this.parseNameEmployeeFrom(line)
                    }
                    if (isNullOrUndefined(ticketBuild.ticketNum) ||
                        isNullOrUndefined(ticketBuild.orderType))
                    {
                        var tuple = this.parseTicketNumberAndTypeFrom(line)
                        if (!isNullOrUndefined(tuple))
                        {
                            ticketBuild.ticketNum = tuple[0]
                            ticketBuild.orderType = tuple[1]
                        }
                    }
                    if (isNullOrUndefined(ticketBuild.customerName) ||
                        isNullOrUndefined(ticketBuild.phone))
                    {
                        var tuple = this.parsePhoneAndNameCustFrom(line)
                        if (!isNullOrUndefined(tuple))
                        {
                            ticketBuild.phone = tuple[0]
                            ticketBuild.customerName = tuple[1]
                        }
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
