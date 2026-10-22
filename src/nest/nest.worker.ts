import { expose } from 'comlink'
import { nestJob } from './nestJob'
export type { NestBoard, NestJob } from './nestJob'
const api = { nestJob }
expose(api)
export type NestWorkerApi = typeof api
