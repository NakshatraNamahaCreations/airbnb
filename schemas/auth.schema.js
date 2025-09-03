import z from 'zod';

const signupSchema = z.object({
  name: z
    .string({ required_error: 'Username is required' })
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must not exceed 20 characters'),

  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email address'),

  password: z
    .string({ required_error: 'Password is required' })
    .min(6, 'Password must be at least 6 characters'),

  dateOfBirth: z
    .string({ required_error: 'Date of birth is required' })
    .transform((str) => {
      // Parse the string into a Date object
      const date = new Date(str);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date format. Use YYYY-MM-DD');
      }
      return date;
    })
    .refine(
      (date) => {
        const eighteenYearsAgo = new Date();
        eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);
        return date <= eighteenYearsAgo;
      },
      'You must be at least 18 years old',
    ),
});

const loginSchema = z.object({
  email: z.string({ required_error: 'Email is required' }).email('Invalid email address'),

  password: z
    .string({ required_error: 'Password is required' }),
  // .min(6, "Password must be at least 6 characters"),    //u might not need this
});

const updateProfileSchema = z.object({
  name: z
    .string({ required_error: 'Username is required' })
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must not exceed 20 characters')
    .optional(),

  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email address')
    .optional(),

  dateOfBirth: z
    .string({ required_error: 'Date of birth is required' })
    .transform((str) => {
      // Parse the string into a Date object
      const date = new Date(str);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date format. Use YYYY-MM-DD');
      }
      return date;
    })
    .refine(
      (date) => {
        const eighteenYearsAgo = new Date();
        eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);
        return date <= eighteenYearsAgo;
      },
      'You must be at least 18 years old',
    )
    .optional(),

  // password: z
  //   .string({ required_error: "Password is required" })
  //   .min(6, "Password must be at least 6 characters"),
});

export { signupSchema, loginSchema, updateProfileSchema };
