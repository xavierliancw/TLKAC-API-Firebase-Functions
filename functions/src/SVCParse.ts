import fs = require('fs')
import ReadLine = require('readline')
import Stream = require('stream')

export class SVCTicketParse
{
    //https://stackoverflow.com/a/16013228/8462094
    static parseTicketFile(path: string): Promise<number>
    {
        return new Promise((resolve, reject) =>
        {
            //Make sure the file exists
            if (!fs.existsSync(path))
            {
                reject("${path} could not be opened since it does not exist")
                return
            }
            var is = fs.createReadStream(path);
            var os = new Stream.Duplex  //Writable and readable stream
            var rl = ReadLine.createInterface({ input: is, output: os, terminal: false })
            var count = 0
            rl
                .on('line', (line) =>
                {
                    count++
                })
                .on('close', () =>
                {
                    resolve(count)
                })
                .on('SIGCONT', () =>
                {
                    reject("ReadLine encountered SIGCONT")
                })
                .on('SIGINT', () =>
                {
                    reject("ReadLine encountered SIGINT")
                })
                .on('SIGTSTP', () =>
                {
                    reject("ReadLine encountered SIGTSTP")
                })
        })
    }
}
