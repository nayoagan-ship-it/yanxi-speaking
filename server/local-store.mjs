import {DatabaseSync} from 'node:sqlite';
import {QUOTA_SCHEMA} from './api.mjs';
export function localDatabase(filename=':memory:'){
 const db=new DatabaseSync(filename);db.exec(QUOTA_SCHEMA);
 return {prepare(sql){const statement=db.prepare(sql);return {bind(...args){return {async run(){const result=statement.run(...args);return {meta:{changes:Number(result.changes)}};},async first(){return statement.get(...args)||null;}};}};},close(){db.close();}};
}
