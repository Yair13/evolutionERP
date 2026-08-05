import "express";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        email: string;
        fullName: string;
        roles: string[];
        /** null = acceso a todas las sedes */
        warehouseIds: string[] | null;
      };
    }
  }
}

export {};
