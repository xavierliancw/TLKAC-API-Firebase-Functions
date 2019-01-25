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
    var testTicketDeliveryNoRemarksOld = __dirname + 
        "/sample_data/sample_delivery_old_no_remarks.txt"
    var nonexistentPath = "this path shall not exist!"

    it("can parse an old delivery ticket with no remarks", (done) => 
    {
        new SVCTicketParse().parseTicketFromFile(testTicketDeliveryNoRemarksOld)
            .then(inTick => 
            {
                expect(inTick.employeeName).to.equal("X")
                expect(inTick.ticketNum).to.equal("292223")
                expect(inTick.orderType).to.equal("Delivery")
                expect(inTick.phone).to.equal("(123) 123-1234")
                expect(inTick.customerName).to.equal("Owen / Sonya")
                expect(inTick.streetAddress).to.equal("33333 Abcdef Dr; A")
                expect(inTick.city).to.equal("Dana Point")
                expect(inTick.customerRemarks).to.equal(null)
                expect(inTick.orderTotal).to.equal("$58.35")
                expect(inTick.ticketInception).to.equal("9/16/2018 4:43:08 PM")
                done()
            })
            .catch(err =>
            {
                done(err)
            })
    })

    it("can parse the sample delivery ticket file correctly", (done) => 
    {
        new SVCTicketParse().parseTicketFromFile(sampleDeliveryTicketPath)
            .then(inTick => 
            {
                expect(inTick.employeeName).to.equal("Dude")
                expect(inTick.ticketNum).to.equal("304632")
                expect(inTick.orderType).to.equal("Delivery")
                expect(inTick.phone).to.equal("(949) 606-7271")
                expect(inTick.customerName).to.equal("Robert")
                expect(inTick.streetAddress).to.equal("12345 The Streeters")
                expect(inTick.city).to.equal("Dana Point")
                expect(inTick.customerRemarks).to.equal(
                    "Cross Street:  .Rockshill & Reed Lantern\n" +
                    "Remarks: This is a remark that is going\n" +
                    "to be multiline."
                )
                expect(inTick.orderTotal).to.equal("$78.37")
                expect(inTick.ticketInception).to.equal("12/8/2018 4:53:50 PM")
                done()
            })
            .catch(err =>
            {
                done(err)
            })
    })

    it("can parse a delivery ticket with empty fields correctly", (done) => 
    {
        new SVCTicketParse().parseTicketFromFile(sampleDeliveryBlankDataTicketPath)
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
