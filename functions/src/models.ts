
export enum TicketType 
{
    delivery = "Delivery",
    takeOut = "Take Out",
    phone = "Phone",
    dineIn = "Dine In"
}

export class Ticket 
{
    ticketNum: string;
    orderType: TicketType;
    customerName: string;
    phone: string;
    streetAddress: string;
    city: string;
    customerRemarks: string;
    ticketInception: Date;
    storageLocation: String;
}

export enum CirrusService
{
    uploadService = "Upload Service",
    unspecified = "Unspecified"
}
