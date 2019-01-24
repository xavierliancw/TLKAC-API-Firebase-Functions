import 'mocha'
import { expect, assert } from 'chai'
import { SVCTicketParse } from '../src/SVCParse'
import { Ticket } from '../src/models'
declare var __dirname: string

describe('SVCParse', () =>
{
    var sampleDeliveryTicketPath = __dirname + "/sample_data/sample_delivery.txt"
    var sampleDeliveryBlankDataTicketPath = __dirname +
        "/sample_data/sample_delivery_empty_fields.txt"
    var nonexistentPath = "this path shall not exist!"

    it("can parse the sample delivery ticket file correctly", (done) => 
    {
        SVCTicketParse.parseTicketFromFile(sampleDeliveryTicketPath)
            .then(inTick => 
            {
                expect(inTick.employeeName).to.equal("Dude")
                expect(inTick.ticketNum).to.equal("304632")
                expect(inTick.orderType).to.equal("Delivery")
                expect(inTick.phone).to.equal("(949) 606-7271")
                expect(inTick.customerName).to.equal("Robert")
                done()
            })
            .catch(err =>
            {
                done(err)
            })
    })

    it("can parse a delivery ticket with empty fields correctly", (done) => 
    {
        SVCTicketParse.parseTicketFromFile(sampleDeliveryBlankDataTicketPath)
            .then(inTick => 
            {
                expect(inTick.employeeName).to.equal("")
                done()
            })
            .catch(err =>
            {
                done(err)
            })
    })

    it("can rename a generate a name for a ticket file based on the contents of the ticket", () => 
    {

    })
})
