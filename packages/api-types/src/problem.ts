export interface ProblemDetail {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errorCode?: string;
  details?: unknown;
}

export interface ProblemResponse {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance: string;
  errorCode?: string;
  details?: unknown;
  requestId: string;
}
