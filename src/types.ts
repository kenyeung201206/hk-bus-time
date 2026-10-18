export type Company = 'KMB' | 'CTB';
export type Dir = 'O' | 'I';

export interface Route {
  id: string; // `${co}-${route}-${dir}-${serviceType}`
  co: Company;
  route: string;
  dir: Dir;
  serviceType: number;
  origTc: string;
  destTc: string;
  origEn: string;
  destEn: string;
  origSc: string;
  destSc: string;
}

export interface Stop {
  key: string; // `${co}-${stopId}`
  co: Company;
  stopId: string;
  nameTc: string;
  nameEn: string;
  nameSc: string;
  lat: number;
  lng: number;
}

export interface Favourite {
  id: string;
  co: Company;
  route: string;
  dir: Dir;
  serviceType: number;
  stopId: string;
  label?: string;
  group?: 'morning' | 'evening' | 'other';
  sortOrder: number;
  createdAt: number;
}

export interface SavedTrip {
  id: string;
  label: string;
  from: string;
  to: string;
  createdAt: number;
}

export interface Arrival {
  etaSeq: number;
  etaTime: Date | null;
  minutes: number | null;
  remarkTc: string;
  destTc: string;
  dataTimestamp: Date;
}

/** Compact on-disk format of bus-data.json */
export interface BusData {
  version: number;
  generatedAt: string;
  /** [co, route, dir, serviceType, origTc, destTc, origEn, destEn, origSc, destSc] */
  routes: [Company, string, Dir, number, string, string, string, string, string, string][];
  /** stopKey -> [nameTc, nameEn, nameSc, lat, lng] */
  stops: Record<string, [string, string, string, number, number]>;
  /** routeId -> ordered stop ids */
  routeStops: Record<string, string[]>;
}
