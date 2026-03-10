export interface IdentifyRequest {
    email?: string | null;
    phoneNumber?: string | null;
  }
  
  export interface ConsolidatedContact {
    primaryContatctId: number;  // typo is intentional — matches the spec exactly
    emails: string[];
    phoneNumbers: string[];
    secondaryContactIds: number[];
  }
  
  export interface IdentifyResponse {
    contact: ConsolidatedContact;
  }