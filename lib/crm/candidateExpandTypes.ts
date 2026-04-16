export type CandidateExpandInvoice = {
  invoice_id: string;
  label: string;
  invoice_date: string;
  amount: string;
};

export type CandidateExpandDetails = {
  email: string | null;
  phone: string | null;
  address: string | null;
  invoices: CandidateExpandInvoice[];
};
