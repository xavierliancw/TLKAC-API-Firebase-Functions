export class Ticket 
{
    ticketNum: string;
    orderType: string;
    customerName: string;
    phone: string;
    streetAddress: string;
    city: string;
    customerRemarks: string;
    ticketInception: string;
    storageLocation: string;
}

export enum CirrusService
{
    uploadService = "uploadService",
    unspecified = "unspecified"
}
