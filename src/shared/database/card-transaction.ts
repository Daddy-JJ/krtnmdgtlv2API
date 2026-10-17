import type { Pool, PoolConnection } from 'mysql2/promise';

// Retry only InnoDB's fully rolled-back deadlock victim; no gateway/mail I/O here.
export async function cardTransaction<T>(pool:Pool,work:(c:PoolConnection)=>Promise<T>):Promise<T> {
  for(let attempt=0;;attempt++) {
    const c=await pool.getConnection();
    try {await c.beginTransaction();const result=await work(c);await c.commit();return result;}
    catch(error) {
      await c.rollback();
      if((error as {code?:string})?.code==='ER_LOCK_DEADLOCK'&&attempt<4)continue;
      throw error;
    } finally {c.release();}
  }
}
