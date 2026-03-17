import { getClient as getClientFromPool } from './index';

export const getClient = () => {
  return getClientFromPool();
};
