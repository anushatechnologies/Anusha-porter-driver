import { useState } from 'react';
import { validateLocationServiceable } from '../services/api';

export const useLocationServiceability = () => {
  const [isServiceable, setIsServiceable] = useState<boolean>(true);
  const [validationMessage, setValidationMessage] = useState<string>('');
  const [approvedAreas, setApprovedAreas] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState<boolean>(false);

  const checkLocation = async (lat: number, lng: number, pincode?: string, city?: string) => {
    setIsValidating(true);
    try {
      const res = await validateLocationServiceable({
        lat,
        lng,
        pincode,
        city: city || 'Hyderabad',
      });

      const isServ = res?.serviceable !== undefined ? !!res.serviceable : ((res as any)?.isServiceable !== undefined ? !!(res as any).isServiceable : true);

      if (isServ) {
        setIsServiceable(true);
        setValidationMessage('');
        setApprovedAreas([]);
      } else {
        setIsServiceable(false);
        setValidationMessage(res?.message || 'Area not serviceable');
        setApprovedAreas(Array.isArray(res?.approvedAreas) ? res.approvedAreas : []);
      }
      return res;
    } catch (err) {
      console.warn('Serviceability check error:', err);
      return { success: false, serviceable: true };
    } finally {
      setIsValidating(false);
    }
  };

  return { isServiceable, validationMessage, approvedAreas, isValidating, checkLocation };
};
