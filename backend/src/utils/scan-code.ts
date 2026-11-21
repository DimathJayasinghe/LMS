export const formatLmsBarcode = (indexNumber: number): string => `LMS-${String(indexNumber).padStart(6, '0')}`;
