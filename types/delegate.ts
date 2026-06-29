export interface Delegate {
  uuid: string;
  name: string;
  committee: string;
  portfolio: string;
  feeStatus: string;
  contact: string;
  email: string;
  checkedIn: boolean;
  checkInTime: string | null;
  device: string | null;
  rowIndex: number; // 1-based sheet row index (header = row 1, first data row = row 2)
}

export type ScanResult =
  | { status: 'verified'; delegate: Delegate }
  | { status: 'already_checked_in'; delegate: Delegate }
  | { status: 'invalid' }
  | { status: 'error'; message: string };

export interface AttendanceRequest {
  uuid: string;
}

export interface AttendanceResponse {
  success: boolean;
  error?: string;
}

export interface DelegateApiResponse {
  status: 'verified' | 'already_checked_in' | 'invalid' | 'error';
  delegate?: Delegate;
  message?: string;
}
