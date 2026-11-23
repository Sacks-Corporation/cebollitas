/** Read-all / write-all store, the same contract as the Python repositories. */
export interface Repository<T = any> {
  read(): Promise<T>;
  write(data: T): Promise<void>;
}
