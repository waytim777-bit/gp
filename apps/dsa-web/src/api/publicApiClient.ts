import axios from 'axios';
import { API_BASE_URL } from '../utils/constants';

/** Axios client for unauthenticated public report endpoints. */
export const publicApiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});
