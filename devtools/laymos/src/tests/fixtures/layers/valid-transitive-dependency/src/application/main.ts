import { findUser } from '../domain/user.js';
import { database } from '../infrastructure/database.js';

export const user = findUser(database);
