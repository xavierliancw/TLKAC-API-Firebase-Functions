import 'mocha'
import { expect } from 'chai'
import { SVCTicketParse } from '../src/SVCParse'
declare var __dirname: string

describe('SVCParse', () =>
{
    it('test test', (done) =>
    {
        var path = __dirname + "/sample_delivery.txt"
        const result = Promise.resolve(SVCTicketParse.parseTicketFile(path))
        result
            .then((data) =>
            {
                expect(data).to.equal(60)
                done()
            })
            .catch(err =>
            {
                done(err)
            })
    })
})
