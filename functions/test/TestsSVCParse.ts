import { expect } from 'chai'
import 'mocha'
import { SVCParse } from '../src/SVCParse'

describe('SVCParse', () => {
    it('test test yields "hi"', () => {
        const x = SVCParse.extractDataFrom("")
        expect(x).to.equal("hdi")
    })
})
