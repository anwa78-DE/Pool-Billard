export interface Booking {
  id: string;
  tableId: number;
  memberName: string;
  startTime: string; // ISO string
  endTime: string;   // ISO string
  date: string;      // YYYY-MM-DD
}

export interface Table {
  id: number;
  name: string;
}

export const TABLES: Table[] = [
  { id: 1, name: "Tisch 1" },
  { id: 2, name: "Tisch 2" },
  { id: 3, name: "Tisch 3" },
  { id: 4, name: "Tisch 4" },
];

export const OPENING_HOUR = 0;
export const CLOSING_HOUR = 23;
