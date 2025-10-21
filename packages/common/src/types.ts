import z from "zod";

export const signUpSchema = z
  .object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["password", "confirmPassword"],
  });

export const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export const roomSchema = z.object({
  slug: z.string().min(1),
});
