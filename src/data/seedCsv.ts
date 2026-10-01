// Clean CSV schemas without mock/dummy orders
export const SEED_RETURNS_CSV = `S.No.,Client Name,Type,Reason,OLD Order ID,New Order ID,RETURN Received?,Status,REPLAMENT DONE? Y/N,Region,Initiated Date,New Target Date,Incoming Courier,Incoming Tracking No.,ExchangeTracking,Country,Picture,CreatedBy,Notes`;

export const SEED_DISPATCH_CSV = `S.No.,Date ,Order Number,International/Domestic,Tracking Details,COURIER,Tracking & Ful unful on website (Y/N),NOTES`;

export const SEED_DELINQUENCY_CSV = `S.N.,Store,Order ID,Customer Name,Order Date,DELAY DAYS,Current Stage,Delay Reason,Action Required,Escalation Status`;
