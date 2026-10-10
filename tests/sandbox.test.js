import assert from 'node:assert';
import { SecureSandbox } from '../server/engine/sandbox.js';

console.log('--- Testing SecureSandbox Module ---');

// Test 1: Legitimate transformation
{
  console.log('Test 1: Standard transformation (Capitalization & Math)');
  const sandbox = new SecureSandbox({
    transformCode: `
      row.name = row.name.toUpperCase();
      row.total = Number(row.qty) * Number(row.price);
      return row;
    `
  });

  const input = { name: 'alice smith', qty: '3', price: '15.50' };
  const output = sandbox.execute(input);

  assert.strictEqual(output.name, 'ALICE SMITH');
  assert.strictEqual(output.total, 46.5);
  sandbox.dispose();
  console.log('✓ Test 1 Passed');
}

// Test 2: Timeout containment (Infinite loop defense)
{
  console.log('Test 2: Infinite loop timeout protection');
  const sandbox = new SecureSandbox({
    transformCode: `
      while(true) {}
      return row;
    `,
    timeoutMs: 30
  });

  let threw = false;
  try {
    sandbox.execute({ test: 1 });
  } catch (err) {
    threw = true;
    assert.match(err.message, /timeout/i);
  }

  assert.strictEqual(threw, true, 'Sandbox should throw on timeout');
  sandbox.dispose();
  console.log('✓ Test 2 Passed: Infinite loop caught by sandbox timeout');
}

// Test 3: Environment isolation (Prevent process & require escapes)
{
  console.log('Test 3: Process & Require isolation');
  const sandbox = new SecureSandbox({
    transformCode: `
      if (typeof process !== 'undefined' && process.exit) {
        process.exit(1);
      }
      if (typeof require !== 'undefined') {
        const fs = require('fs');
      }
      return row;
    `
  });

  const output = sandbox.execute({ clean: true });
  assert.strictEqual(output.clean, true);
  sandbox.dispose();
  console.log('✓ Test 3 Passed: Global environment isolated');
}

// Test 4: Batch transformation & Quarantine isolation
{
  console.log('Test 4: Batch transformation with quarantined errors');
  const sandbox = new SecureSandbox({
    transformCode: `
      if (row.val < 0) throw new Error("Negative value rejected");
      row.val = row.val * 2;
      return row;
    `
  });

  const batch = [{ val: 10 }, { val: -5 }, { val: 20 }];
  const result = sandbox.executeBatch(batch);

  assert.strictEqual(result.transformed.length, 2);
  assert.strictEqual(result.quarantined.length, 1);
  assert.strictEqual(result.transformed[0].val, 20);
  assert.strictEqual(result.transformed[1].val, 40);
  assert.strictEqual(result.quarantined[0].rowIndex, 1);
  sandbox.dispose();
  console.log('✓ Test 4 Passed: Batch execution correctly quarantined bad rows');
}

console.log('=======================================');
console.log('🎉 ALL SECURE SANDBOX TESTS PASSED!');
console.log('=======================================');
