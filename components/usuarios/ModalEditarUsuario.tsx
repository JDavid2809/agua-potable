'use client';

import React, { useState, useEffect } from 'react';
import { X, UserCheck, Shield, Phone, Lock, Key, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { sileo } from 'sileo';
import type { PermisoSistema, RolUsuario } from '@/types/database';
import { obtenerMensajeError } from '@/lib/utils/errors';

export interface UsuarioAEditar {
  id: string;
  email: string;
  nombre_completo: string;
  rol: RolUsuario;
  permisos: string[];
  telefono?: string;
  activo: boolean;
}

export interface ModalEditarUsuarioProps {
  usuario: UsuarioAEditar | null;
  onClose: () => void;
  onUsuarioActualizado: () => void;
}

const PERMISOS_DISPONIBLES: { id: PermisoSistema; etiqueta: string; categoria: string }[] = [
  { id: 'cobros.crear', etiqueta: 'Registrar cobros y emitir recibos', categoria: 'Caja y Recaudación' },
  { id: 'cobros.anular', etiqueta: 'Cancelar o anular recibos emitidos', categoria: 'Caja y Recaudación' },
  { id: 'tomas.ver', etiqueta: 'Consultar padrón de tomas', categoria: 'Tomas de Agua' },
  { id: 'tomas.gestionar', etiqueta: 'Crear y modificar tomas de agua', categoria: 'Tomas de Agua' },
  { id: 'personas.ver', etiqueta: 'Consultar contribuyentes', categoria: 'Contribuyentes' },
  { id: 'personas.gestionar', etiqueta: 'Registrar y editar contribuyentes', categoria: 'Contribuyentes' },
  { id: 'tarifas.gestionar', etiqueta: 'Configurar tarifas anuales y cuotas', categoria: 'Administración' },
  { id: 'reportes.ver', etiqueta: 'Ver reportes financieros y cortes de caja', categoria: 'Administración' },
];

export function ModalEditarUsuario({
  usuario,
  onClose,
  onUsuarioActualizado,
}: ModalEditarUsuarioProps) {
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [rol, setRol] = useState<RolUsuario>('cajero');
  const [permisosSeleccionados, setPermisosSeleccionados] = useState<string[]>([]);
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (usuario) {
      setNombreCompleto(usuario.nombre_completo || '');
      setTelefono(usuario.telefono || '');
      setRol(usuario.rol);
      setPermisosSeleccionados(usuario.permisos || []);
      setNuevaPassword('');
    }
  }, [usuario]);

  if (!usuario) return null;

  const handleTogglePermiso = (pId: string) => {
    setPermisosSeleccionados((prev) =>
      prev.includes(pId) ? prev.filter((p) => p !== pId) : [...prev, pId]
    );
  };

  const handleCambioRol = (nuevoRol: RolUsuario) => {
    setRol(nuevoRol);
    if (nuevoRol === 'administrador') {
      setPermisosSeleccionados(['*']);
    } else if (nuevoRol === 'lector') {
      setPermisosSeleccionados(['tomas.ver', 'personas.ver']);
    } else {
      setPermisosSeleccionados(['cobros.crear', 'tomas.ver', 'personas.ver']);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nombreCompleto.trim()) {
      sileo.error({ title: 'Campo requerido', description: 'El nombre completo es obligatorio.' });
      return;
    }

    if (nuevaPassword.trim() && nuevaPassword.trim().length < 6) {
      sileo.error({ title: 'Contraseña muy corta', description: 'La contraseña debe tener mínimo 6 caracteres.' });
      return;
    }

    try {
      setGuardando(true);
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: usuario.id,
          nombre_completo: nombreCompleto.trim(),
          telefono: telefono.trim() || null,
          rol,
          permisos: permisosSeleccionados,
          password: nuevaPassword.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudieron actualizar los datos del usuario.');
      }

      sileo.success({
        title: 'Usuario actualizado',
        description: data.mensaje || `Se actualizaron los datos de ${nombreCompleto}.`,
      });

      onUsuarioActualizado();
      onClose();
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al actualizar',
        description: obtenerMensajeError(err, 'No se pudo guardar la información del usuario.'),
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-left">
        {/* Cabecera */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Editar Datos de Usuario
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {usuario.email} • Cuenta {usuario.activo ? 'Activa' : 'Suspendida'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario con scroll */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nombre Completo *"
              value={nombreCompleto}
              onChange={(e) => setNombreCompleto(e.target.value)}
              required
            />

            <Input
              label="Teléfono (Opcional)"
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              icon={<Phone className="w-4 h-4" />}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Rol en el Sistema *"
              value={rol}
              onChange={(e) => handleCambioRol(e.target.value as RolUsuario)}
              options={[
                { value: 'cajero', label: 'Cajero (Ventanilla de Cobro)' },
                { value: 'lector', label: 'Lector (Lecturas de Medidor)' },
                { value: 'administrador', label: 'Administrador (Control Total)' },
              ]}
            />

            <Input
              label="Nueva Contraseña (Opcional)"
              type="password"
              placeholder="Dejar en blanco para no cambiarla"
              value={nuevaPassword}
              onChange={(e) => setNuevaPassword(e.target.value)}
              icon={<Lock className="w-4 h-4" />}
            />
          </div>

          {/* Permisos Granulares */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Key className="w-4 h-4 text-blue-500" />
                Permisos del Usuario
              </span>
              {rol === 'administrador' && (
                <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                  Rol administrador cuenta con todos los permisos (*)
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PERMISOS_DISPONIBLES.map((p) => {
                const asignado = rol === 'administrador' || permisosSeleccionados.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={rol === 'administrador'}
                    onClick={() => handleTogglePermiso(p.id)}
                    className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-colors ${
                      asignado
                        ? 'border-blue-600/60 bg-blue-50/50 dark:bg-blue-950/20 text-slate-900 dark:text-white'
                        : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300'
                    } ${rol === 'administrador' ? 'opacity-80 cursor-default' : 'cursor-pointer'}`}
                  >
                    <div
                      className={`w-4 h-4 rounded-md mt-0.5 flex items-center justify-center shrink-0 border ${
                        asignado
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {asignado && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div>
                      <span className="text-xs font-bold block">{p.etiqueta}</span>
                      <span className="text-[10px] text-slate-400 block">{p.categoria}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={guardando}>
              Guardar Cambios
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

