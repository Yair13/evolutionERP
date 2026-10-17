export type RoleRow = { id: string; code: string; name: string };

export type WarehouseRow = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  is_active: boolean;
  is_factory?: boolean;
  created_at: string;
};

export type UserRow = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  hasAdminAccess: boolean;
  createdAt: string;
  roles: string[];
  warehouseIds: string[];
};
