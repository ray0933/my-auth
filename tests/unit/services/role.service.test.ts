import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/repositories/role.repository');
vi.mock('../../../src/services/audit.service');

import * as roleRepo from '../../../src/repositories/role.repository';
import * as roleService from '../../../src/services/role.service';

beforeEach(() => vi.clearAllMocks());

describe('roleService.getPermissionsForUser', () => {
  it('returns correct permissions via role hierarchy', async () => {
    vi.mocked(roleRepo.getPermissionsForUser).mockResolvedValue(['users:read', 'users:write']);
    const perms = await roleService.getPermissionsForUser('user-1');
    expect(perms).toContain('users:read');
    expect(perms).toContain('users:write');
  });

  it('returns empty array when user has no roles', async () => {
    vi.mocked(roleRepo.getPermissionsForUser).mockResolvedValue([]);
    const perms = await roleService.getPermissionsForUser('user-2');
    expect(perms).toHaveLength(0);
  });
});
