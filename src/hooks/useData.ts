import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { useAuth } from '../App';
import { Property, Tenant, Lease, Payment, ReminderLog } from '../types';

export function usePropertyData() {
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'properties'),
      where('managerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Property));
      setProperties(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'properties');
    });

    return unsubscribe;
  }, [user]);

  const addProperty = async (data: Omit<Property, 'id' | 'managerId' | 'createdAt'>) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'properties'), {
        ...data,
        managerId: user.uid,
        createdAt: new Date().toISOString(), // Using ISO string for simplicity in rules but serverTimestamp is better. Rules use string size checks.
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'properties');
    }
  };

  return { properties, loading, addProperty };
}

export function useTenantData() {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'tenants'),
      where('managerId', '==', user.uid),
      orderBy('name', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tenant));
      setTenants(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tenants');
    });

    return unsubscribe;
  }, [user]);

  const addTenant = async (data: Omit<Tenant, 'id' | 'managerId' | 'createdAt'>) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'tenants'), {
        ...data,
        managerId: user.uid,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tenants');
    }
  };

  return { tenants, loading, addTenant };
}

export function useLeaseData() {
  const { user } = useAuth();
  const [leases, setLeases] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'leases'),
      where('managerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lease));
      setLeases(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'leases');
    });

    return unsubscribe;
  }, [user]);

  const createLease = async (data: Omit<Lease, 'id' | 'managerId' | 'createdAt' | 'status'>) => {
    if (!user) return;
    
    // Validation
    if (new Date(data.endDate) <= new Date(data.startDate)) {
      throw new Error("CHRONOLOGICAL ERROR: Termination date must follow initialization date.");
    }

    try {
      await addDoc(collection(db, 'leases'), {
        ...data,
        status: 'ACTIVE',
        managerId: user.uid,
        createdAt: new Date().toISOString(),
        reminderLeadTimes: data.reminderLeadTimes || [7, 2] // Default settings
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'leases');
    }
  };

  const terminateLease = async (leaseId: string) => {
    if (!user) return;
    try {
      const lRef = doc(db, 'leases', leaseId);
      await updateDoc(lRef, {
        status: 'TERMINATED',
        endDate: new Date().toISOString().split('T')[0]
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leases/${leaseId}`);
    }
  };

  return { leases, loading, createLease, terminateLease };
}

export function useReminderData() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<ReminderLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'reminders'),
      where('managerId', '==', user.uid),
      orderBy('sentAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReminderLog));
      setReminders(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'reminders');
    });

    return unsubscribe;
  }, [user]);

  const logReminder = async (data: Omit<ReminderLog, 'id'>) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'reminders'), data);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'reminders');
    }
  };

  return { reminders, loading, logReminder };
}
export function usePaymentData() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'payments'),
      where('managerId', '==', user.uid),
      orderBy('dueDate', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
      setPayments(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'payments');
    });

    return unsubscribe;
  }, [user]);

  const recordPayment = async (paymentId: string) => {
    if (!user) return;
    try {
      const pRef = doc(db, 'payments', paymentId);
      await updateDoc(pRef, {
        status: 'PAID',
        paidAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `payments/${paymentId}`);
    }
  };

  const addPayment = async (data: Omit<Payment, 'id' | 'managerId' | 'status'>) => {
    if (!user) return;
    try {
      const now = new Date();
      const dueDate = new Date(data.dueDate);
      const status = dueDate < now ? 'OVERDUE' : 'PENDING';

      await addDoc(collection(db, 'payments'), {
        ...data,
        status,
        managerId: user.uid,
        createdAt: now.toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'payments');
    }
  };

  return { payments, loading, recordPayment, addPayment };
}
