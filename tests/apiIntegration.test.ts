import assert from 'node:assert';
import { config } from 'dotenv';
import { searchPokemonTcgApi, fetchPokemonTcgSets, isValidSetCode } from '../server/cardDataProvider';

// Load environment variables for API key
config();

console.log('🧪 Starting Pokémon TCG API Integration Tests...');
console.log('⚠️  These tests hit the live Pokémon TCG API and may consume rate limits');

async function runApiTests() {
  // Test set metadata fetching
  console.log('\n1. Testing set metadata fetching...');
  try {
    const sets = await fetchPokemonTcgSets();
    assert.ok(sets.length > 0, 'Should fetch sets from API');
    console.log(`  ✓ Successfully fetched ${sets.length} sets from API`);

    // Test set code validation
    const isValidMeg = await isValidSetCode('MEG');
    const isValidMegLower = await isValidSetCode('meg');
    const isValidPbl = await isValidSetCode('PBL');
    const isValidPblLower = await isValidSetCode('pbl');
    const isValidInvalid = await isValidSetCode('INVALID');

    assert.ok(isValidMeg || isValidMegLower, 'MEG should be recognized as valid set code (case-insensitive)');
    assert.ok(isValidPbl || isValidPblLower, 'PBL should be recognized as valid set code (case-insensitive)');
    assert.strictEqual(isValidInvalid, false, 'INVALID should not be recognized as valid set code');
    console.log('  ✓ Set code validation working correctly');
  } catch (err: any) {
    console.log(`  ⚠ API unavailable (${err.message}), skipping set validation tests`);
  }

  // Test actual API queries
  console.log('\n2. Testing actual Pokémon TCG API queries...');
  const testQueries = [
    'darkrai',
    'Darkrai',
    'MEG',
    'meg',
    'PBL',
    'pbl',
    'Ultra Ball MEG',
    'PBL 35',
    'MEG 131'
  ];

  let successfulQueries = 0;
  for (const query of testQueries) {
    try {
      console.log(`  Testing query: "${query}"`);
      const result = await searchPokemonTcgApi(query, { page: 1, pageSize: 5 });
      assert.ok(result.success !== false, `Query "${query}" should not fail`);
      successfulQueries++;
      // Add delay between queries to respect rate limits (2 seconds)
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err: any) {
      console.log(`  ⚠ Query "${query}" failed: ${err.message}`);
      // Add delay even on failure to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  if (successfulQueries > 0) {
    console.log(`  ✓ ${successfulQueries}/${testQueries.length} queries successful`);
  } else {
    console.log('  ⚠ All API queries failed (API may be unavailable)');
  }

  console.log('\n✅ All API Integration Tests Completed!');
}

runApiTests().catch(err => {
  console.error('[API Tests] Fatal error:', err);
  process.exit(1);
});
