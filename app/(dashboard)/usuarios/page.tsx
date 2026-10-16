'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  UserPlus,
  Shield,
  ShieldCheck,
  Users,
  Check,
  X,
  RefreshCw,
  Mail,
  Lock,
  Phone,
  Key,
} from 'lucide-react';
import { sileo } from 'sileo';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { PermisoSistema, RolUsuario } from '@/types/database';
import { obtenerMensajeError } from '@/lib/utils/errors';

interface UsuarioItem {
  id: string;
  email: string;
  nombre_completo: string;
  rol: RolUsuario;
  permisos: string[];
  telefono?: string;
  activo: boolean;
  created_at: string;
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

export default function UsuariosPage() {
  const router = useRouter();
  const [usuarios, setUsuarios] = useState<UsuarioItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Formulario nuevo usuario
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [telefono, setTelefono] = useState('');
  const [rol, setRol] = useState<RolUsuario>('cajero');
  const [permisosSeleccionados, setPermisosSeleccionados] = useState<string[]>([
    'cobros.crear',
    'tomas.ver',
    'personas.ver',
  ]);

  const cargarUsuarios = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();

      if (res.status === 403 || res.status === 401) {
        sileo.error({
          title: 'Acceso restringido',
          description: 'Solo los administradores pueden gestionar usuarios.',
        });
        router.push('/dashboard');
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'No se pudieron cargar los usuarios');
      }

      setUsuarios(data.usuarios || []);
    } catch (err: unknown) {
      sileo.error({
        title: 'Error de carga',
        description: obtenerMensajeError(err, 'No se pudieron cargar los usuarios'),
      });
    } finally {
      setCargando(false);
    }
  }, [router]);

  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/users');
        const data = await res.json();
        if (ignore) return;
        if (res.status === 403 || res.status === 401) {
          sileo.error({
            title: 'Acceso restringido',
            description: 'Solo los administradores pueden gestionar usuarios.',
          });
          router.push('/dashboard');
          return;
        }
        if (!res.ok) {
          throw new Error(data.error || 'No se pudieron cargar los usuarios');
        }
        setUsuarios(data.usuarios || []);
      } catch (err: unknown) {
        if (!ignore) {
          sileo.error({
            title: 'Error de carga',
            description: obtenerMensajeError(err, 'No se pudieron cargar los usuarios'),
          });
        }
      } finally {
        if (!ignore) {
          setCargando(false);
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, [router]);

  // Al cambiar de rol, sugerir permisos
  const handleCambioRol = (nuevoRol: RolUsuario) => {
    setRol(nuevoRol);
    if (nuevoRol === 'administrador') {
      setPermisosSeleccionados(['*']);
    } else if (nuevoRol === 'cajero') {
      setPermisosSeleccionados(['cobros.crear', 'tomas.ver', 'personas.ver', 'personas.gestionar']);
    } else {
      setPermisosSeleccionados(['tomas.ver', 'personas.ver']);
    }
  };

  const togglePermiso = (permisoId: string) => {
    if (permisosSeleccionados.includes(permisoId)) {
      setPermisosSeleccionados(permisosSeleccionados.filter((p) => p !== permisoId));
    } else {
      setPermisosSeleccionados([...permisosSeleccionados, permisoId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nombreCompleto.trim() || !email.trim() || !password) {
      sileo.warning({
        title: 'Campos requeridos',
        description: 'Por favor completa el nombre, correo y contraseña.',
      });
      return;
    }

    if (password.length < 6) {
      sileo.warning({
        title: 'Contraseña débil',
        description: 'La contraseña debe tener mínimo 6 caracteres.',
      });
      return;
    }

    setGuardando(true);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre_completo: nombreCompleto.trim(),
          email: email.trim(),
          password: password, // No recortar contraseña con trim()
          telefono: telefono.trim() || undefined,
          rol,
          permisos: rol === 'administrador' ? ['*'] : permisosSeleccionados,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al crear el usuario');
      }

      sileo.success({
        title: 'Usuario creado',
        description: data.mensaje || `Se ha registrado a ${nombreCompleto}.`,
      });

      // Limpiar y cerrar modal
      setNombreCompleto('');
      setEmail('');
      setPassword('');
      setTelefono('');
      setRol('cajero');
      setPermisosSeleccionados(['cobros.crear', 'tomas.ver', 'personas.ver']);
      setModalAbierto(false);

      cargarUsuarios();
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al dar de alta',
        description: obtenerMensajeError(err, 'Error al crear el usuario'),
      });
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Encabezado de la página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-bold mb-2 border border-blue-200 dark:border-blue-800">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Control de Acceso Comunitario</span>
          </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Usuarios y Permisos
          </h1>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
            Gestiona los administradores y cajeros autorizados para operar el sistema.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="md"
            onClick={cargarUsuarios}
            disabled={cargando}
            icon={<RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />}
          >
            Actualizar
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={() => setModalAbierto(true)}
            icon={<UserPlus className="w-4 h-4" />}
          >
            Nuevo Usuario
          </Button>
        </div>
      </div>

      {/* Tabla de Usuarios */}
      <Card className="overflow-hidden border border-slate-200 dark:border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-6 py-4">Usuario</th>
                <th className="px-6 py-4">Rol</th>
                <th className="px-6 py-4">Permisos Asignados</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Fecha de Alta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
              {cargando ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                      <span className="text-xs font-medium">Cargando usuarios...</span>
                    </div>
                  </td>
                </tr>
              ) : usuarios.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <Users className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="font-semibold text-slate-700 dark:text-slate-300">
                      No hay usuarios registrados
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Haz clic en &quot;Nuevo Usuario&quot; para agregar al primer cajero.
                    </p>
                  </td>
                </tr>
              ) : (
                usuarios.map((u) => {
                  const esAdmin = u.rol === 'administrador';
                  const iniciales = u.nombre_completo
                    .split(' ')
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase();

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      {/* Datos del Usuario */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-sm shadow-sm">
                            {iniciales || 'U'}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">
                              {u.nombre_completo}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3" />
                              {u.email || 'Sin correo asociado'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Rol */}
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                            esAdmin
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          }`}
                        >
                          <Shield className="w-3 h-3" />
                          <span className="capitalize">{u.rol}</span>
                        </span>
                      </td>

                      {/* Permisos */}
                      <td className="px-6 py-4 max-w-xs">
                        {esAdmin || u.permisos?.includes('*') ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 dark:text-purple-400">
                            <Key className="w-3 h-3" />
                            Acceso Total (*)
                          </span>
                        ) : !u.permisos || u.permisos.length === 0 ? (
                          <span className="text-xs text-slate-400 italic">Sin permisos</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {u.permisos.map((p) => (
                              <span
                                key={p}
                                className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-medium"
                              >
                                {p.replace('.', ': ')}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            u.activo
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              u.activo ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>

                      {/* Fecha de creación */}
                      <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">
                        {new Date(u.created_at).toLocaleDateString('es-MX', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal: Alta de Nuevo Usuario */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Cabecera del modal */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Registrar Nuevo Usuario
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Asigna credenciales, rol y permisos en tu organización.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              <Input
                label="Nombre Completo *"
                placeholder="Ej: Juan Pérez Martínez"
                value={nombreCompleto}
                onChange={(e) => setNombreCompleto(e.target.value)}
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Correo Electrónico *"
                  type="email"
                  placeholder="cajero@fluvib.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  icon={<Mail className="w-4 h-4" />}
                  required
                />

                <Input
                  label="Teléfono (Opcional)"
                  type="tel"
                  placeholder="244-000-0000"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  icon={<Phone className="w-4 h-4" />}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Contraseña Temporal *"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  icon={<Lock className="w-4 h-4" />}
                  required
                />

                <Select
                  label="Rol en el Comité *"
                  value={rol}
                  onChange={(e) => handleCambioRol(e.target.value as RolUsuario)}
                  options={[
                    { value: 'cajero', label: 'Cajero (Operación de Cobro)' },
                    { value: 'administrador', label: 'Administrador (Control Total)' },
                    { value: 'lector', label: 'Lector (Solo Consulta de Tomas)' },
                  ]}
                />
              </div>

              {/* Selección de Permisos */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-300">
                    Permisos de Acceso
                  </label>
                  {rol === 'administrador' && (
                    <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                      Acceso total concedido automáticamente
                    </span>
                  )}
                </div>

                {rol === 'administrador' ? (
                  <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/50 text-xs font-medium text-purple-700 dark:text-purple-300">
                    Los administradores tienen todos los permisos del sistema (*). No es necesario configurar permisos individuales.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {PERMISOS_DISPONIBLES.map((p) => {
                      const activo = permisosSeleccionados.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => togglePermiso(p.id)}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all text-xs ${
                            activo
                              ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-400 dark:border-blue-600 text-blue-950 dark:text-blue-100 font-semibold'
                              : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center shrink-0 border ${
                              activo
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'border-slate-300 dark:border-slate-600'
                            }`}
                          >
                            {activo && <Check className="w-3 h-3" />}
                          </div>
                          <div className="leading-tight">
                            <span className="block">{p.etiqueta}</span>
                            <span className="text-[10px] opacity-60 font-normal">
                              {p.categoria}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Botones de acción */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalAbierto(false)}
                  disabled={guardando}
                >
                  Cancelar
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  isLoading={guardando}
                  icon={<UserPlus className="w-4 h-4" />}
                >
                  {guardando ? 'Guardando...' : 'Crear Usuario'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
