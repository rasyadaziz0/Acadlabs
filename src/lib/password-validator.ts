export function validatePassword(password: string) {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password harus minimal 8 karakter");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Harus ada huruf besar (A-Z)");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Harus ada huruf kecil (a-z)");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Harus ada angka (0-9)");
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push("Harus ada simbol (!@#$ dll)");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
