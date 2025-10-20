import { User } from "../models/authModel";

declare global {
  namespace Express {
    interface Request {
      user?: User; // 👈 Add your custom property here
    }
  }
}