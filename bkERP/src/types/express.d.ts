import "express";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        email: string;
        fullName: string;
        roles: string[];
        /** true si el usuario tiene acceso a la Sede Administrativa */
        hasAdminAccess: boolean;
        /** null = acceso a todas las sedes operativas */
        warehouseIds: string[] | null;
      };
    }
  }
}

export {};
