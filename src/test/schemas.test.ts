import { describe, it, expect } from 'vitest';
import { applicationFormSchema, inventorSchema } from '../features/applications/schemas';

describe('Patent Application Form Schema Validation', () => {
  it('validates a complete, correct application form payload', () => {
    const validData = {
      applicant_name: 'Aditya Sharma',
      applicant_email: 'aditya.sharma@muj.manipal.edu',
      applicant_department: 'Computer Science and Engineering',
      applicant_registration_number: '219301045',
      applicant_phone: '9876543210',
      title: 'Adaptive Energy Harvesting Micro-Controller for Remote IoT Sensors',
      technical_field: 'Embedded Systems and Renewable Energy',
      background_problem:
        'Remote IoT nodes suffer from finite battery lifetimes requiring frequent physical replacement in harsh environments.',
      description:
        'An adaptive power-management circuit coupled with multi-source piezoelectric and photovoltaic transducers.',
      novelty_features:
        'A dual-stage hysteretic switching mechanism that dynamically scales impedance matching under varying ambient vibration.',
      practical_applications:
        'Long-range environmental monitoring, agricultural soil sensor grids, and industrial vibration telemetry.',
      inventors: [
        {
          full_name: 'Aditya Sharma',
          email: 'aditya.sharma@muj.manipal.edu',
          phone: '9876543210',
          affiliation_type: 'student',
          department: 'Computer Science and Engineering',
          is_primary: true,
          order_index: 0,
        },
      ],
    };

    const result = applicationFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('fails validation when mandatory fields are missing or too short', () => {
    const invalidData = {
      applicant_name: 'A',
      applicant_email: 'invalid-email',
      applicant_department: '',
      applicant_registration_number: '',
      applicant_phone: '',
      title: 'Tiny',
      technical_field: '',
      background_problem: 'Too short',
      description: 'Too short',
      novelty_features: 'Too short',
      practical_applications: 'Too short',
      inventors: [],
    };

    const result = applicationFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors.applicant_email).toBeDefined();
      expect(fieldErrors.title).toBeDefined();
      expect(fieldErrors.inventors).toBeDefined();
    }
  });

  it('validates inventor schema requirements', () => {
    const validInventor = {
      full_name: 'Dr. Anita Joshi',
      email: 'anita.joshi@muj.manipal.edu',
      phone: '9876501234',
      affiliation_type: 'faculty',
      department: 'Electrical Engineering',
      is_primary: false,
      order_index: 1,
    };

    const result = inventorSchema.safeParse(validInventor);
    expect(result.success).toBe(true);
  });
});
