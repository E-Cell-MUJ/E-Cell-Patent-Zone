import { z } from 'zod';

export const inventorSchema = z.object({
  id: z.string().optional(),
  full_name: z.string().min(2, 'Inventor name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().optional().or(z.literal('')),
  affiliation_type: z.enum(['student', 'faculty', 'external']),
  department: z.string().min(2, 'Department is required'),
  is_primary: z.boolean().default(false),
  order_index: z.number().default(0),
});

export const applicationFormSchema = z.object({
  // Applicant details
  applicant_name: z.string().min(2, 'Full name is required'),
  applicant_email: z.string().email('A valid university email is required'),
  applicant_department: z.string().min(2, 'Department is required'),
  applicant_registration_number: z.string().min(2, 'Registration or Employee ID is required'),
  applicant_phone: z.string().min(10, 'A valid contact phone number is required'),

  // Invention details
  title: z
    .string()
    .min(5, 'Title must be at least 5 characters')
    .max(250, 'Title cannot exceed 250 characters'),
  technical_field: z
    .string()
    .min(3, 'Technical field / domain is required'),
  background_problem: z
    .string()
    .min(20, 'Please provide an adequate problem statement (minimum 20 characters)'),
  description: z
    .string()
    .min(30, 'Please provide a detailed technical description (minimum 30 characters)'),
  novelty_features: z
    .string()
    .min(20, 'Please articulate the distinguishing novelty features (minimum 20 characters)'),
  practical_applications: z
    .string()
    .min(20, 'Please describe industrial or practical utility (minimum 20 characters)'),

  // Multi-inventors
  inventors: z
    .array(inventorSchema)
    .min(1, 'At least one inventor (lead or co-inventor) must be specified'),
});

export type ApplicationFormData = z.infer<typeof applicationFormSchema>;
export type InventorFormData = z.infer<typeof inventorSchema>;
