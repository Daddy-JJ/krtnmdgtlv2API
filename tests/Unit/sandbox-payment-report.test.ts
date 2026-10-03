import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'mysql2/promise';
import { MySqlSuperAdminRepository } from '../../src/modules/admin/repositories/mysql-super-admin-repository.ts';

test('reports distinguish sandbox totals and restrict gross revenue to production paid rows',async()=>{
  const queries:string[]=[];
  const pool={execute:async(sql:string,params:unknown[])=>{
    queries.push(sql);assert.ok(params[0] instanceof Date);
    if(sql.includes('SUM(amount)')) {
      if(sql.includes("gateway_environment='production'")) {
        assert.match(sql,/gateway='duitku'/);assert.match(sql,/status='paid'/);assert.match(sql,/paid_at>=\?/);
        return [[{currency:'IDR',amount:55000,count:1}]];
      }
      assert.match(sql,/GROUP BY gateway,gateway_environment,currency,status/);
      assert.match(sql,/COALESCE\(gateway_environment,'unknown'\)/);
      return [[{provider:'duitku',environment:'sandbox',currency:'IDR',status:'paid',count:2,amount:110000}]];
    }
    return [[]];
  }} as unknown as Pool;
  const result=await new MySqlSuperAdminRepository(pool).reports(30);
  assert.deepEqual(result.productionRevenue,[{currency:'IDR',amount:55000,count:1}]);
  assert.deepEqual(result.paymentTotals,[{provider:'duitku',environment:'sandbox',currency:'IDR',status:'paid',count:2,amount:110000}]);
  assert.match(String(result.revenueBasis),/excludes sandbox, unknown environment and retired providers/);
  assert.equal(queries.length,7);
});
