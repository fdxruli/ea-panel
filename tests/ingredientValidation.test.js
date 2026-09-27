import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeIngredientName,
  normalizeBaseUnit,
  findDuplicateIngredient,
  formatDuplicateErrorMessage,
  isDuplicateIngredientError
} from '../src/utils/ingredientValidation.js';

test('normalizeIngredientName strips trailing and extra spaces', () => {
  assert.equal(normalizeIngredientName('  Queso parmesano   '), 'Queso parmesano');
  assert.equal(normalizeIngredientName('Salsa   BBQ'), 'Salsa BBQ');
  assert.equal(normalizeIngredientName(null), '');
  assert.equal(normalizeIngredientName(undefined), '');
});

test('normalizeBaseUnit lowercases and trims', () => {
  assert.equal(normalizeBaseUnit('  Gramo  '), 'gramo');
  assert.equal(normalizeBaseUnit('PIEZA'), 'pieza');
  assert.equal(normalizeBaseUnit(null), '');
});

test('findDuplicateIngredient detects case-insensitive and spaced matches', () => {
  const existing = [
    { id: '1', name: 'Queso parmesano', base_unit: 'gramo', current_stock: 450 },
    { id: '2', name: 'Alita Cruda', base_unit: 'pieza', current_stock: 100 }
  ];

  // Exact match
  assert.equal(findDuplicateIngredient('Queso parmesano', existing)?.id, '1');

  // Case insensitive
  assert.equal(findDuplicateIngredient('queso PARMESANO', existing)?.id, '1');

  // Mobile trailing space
  assert.equal(findDuplicateIngredient('Queso parmesano ', existing)?.id, '1');

  // Non duplicate
  assert.equal(findDuplicateIngredient('Queso Mozzarella', existing), null);
});

test('findDuplicateIngredient ignores current ingredient when editing', () => {
  const existing = [
    { id: '1', name: 'Queso parmesano', base_unit: 'gramo', current_stock: 450 },
    { id: '2', name: 'Alita Cruda', base_unit: 'pieza', current_stock: 100 }
  ];

  // Editing ingredient 1 with its own name should not be considered duplicate
  assert.equal(findDuplicateIngredient('Queso parmesano', existing, '1'), null);

  // Editing ingredient 2 attempting to rename to ingredient 1 SHOULD be considered duplicate
  assert.equal(findDuplicateIngredient('Queso parmesano', existing, '2')?.id, '1');
});

test('isDuplicateIngredientError catches postgres unique constraint errors', () => {
  assert.equal(
    isDuplicateIngredientError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "ingredients_name_key"'
    }),
    true
  );

  assert.equal(
    isDuplicateIngredientError({
      message: 'Network error'
    }),
    false
  );
});

test('formatDuplicateErrorMessage produces user friendly text', () => {
  const msg = formatDuplicateErrorMessage('Queso parmesano');
  assert.ok(msg.includes('Queso parmesano'));
  assert.ok(!msg.includes('ingredients_name_key'));
});
