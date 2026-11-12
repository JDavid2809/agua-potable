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
  ArrowLeft,
  Receipt,
  Clock,
  Pencil,
  Trash2,
  UserX,
  UserCheck,
} from 'lucide-react';
import { sileo } from 'sileo';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/Table';
import type { PermisoSistema, RolUsuario } from '@/types/database';
import { obtenerMensajeError } from '@/lib/utils/errors';
import { useOnlineUsers } from '@/hooks/use-presence-tracker';
import { ModalActividadCajero } from '@/components/usuarios/ModalActividadCajero';
import { ModalEditarUsuario } from '@/components/usuarios/ModalEditarUsuario';

interface UsuarioItem {
  id: string;
  email: string;
  nombre_completo: string;
  rol: RolUsuario;
  permisos: string[];
  telefono?: string;
  activo: boolean;
  ultima_conexion?: string | null;
  created_at: string;
}

function formatearUltimaConexion(fechaIso?: string | null, isOnline?: boolean): string {
  if (isOnline) {
    return 'Activo ahora';
  }
  if (!fechaIso) {
    return 'Sin registro';
  }

  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) {
    return 'Sin registro';
  }

  return fecha.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const onlineUserIds = useOnlineUsers();
  const [modalActividadCajeroId, setModalActividadCajeroId] = useState<string | null>(null);
  const [modalActividadCajeroNombre, setModalActividadCajeroNombre] = useState<string>('');
  const [usuarioAEditar, setUsuarioAEditar] = useState<UsuarioItem | null>(null);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<'lista' | 'formulario'>('lista');
  const [guardando, setGuardando] = useState(false);
  const [procesandoUsuarioId, setProcesandoUsuarioId] = useState<string | null>(null);

  const handleEliminarUsuario = async (u: UsuarioItem) => {
    const confirmar = window.confirm(
      `¿Deseas ELIMINAR permanentemente la cuenta de ${u.nombre_completo} (${u.email})?\n\nEsta acción no se puede deshacer. Los cobros y recibos que haya emitido históricamente se conservarán intactos para las auditorías.`
    );
    if (!confirmar) return;

    try {
      setProcesandoUsuarioId(u.id);
      const res = await fetch(`/api/admin/users?userId=${u.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo eliminar el usuario.');
      }
      sileo.success({
        title: 'Usuario eliminado',
        description: data.mensaje || `${u.nombre_completo} fue eliminado del sistema.`,
      });
      cargarUsuarios();
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al eliminar',
        description: obtenerMensajeError(err, 'No se pudo eliminar el usuario.'),
      });
    } finally {
      setProcesandoUsuarioId(null);
    }
  };

  const handleToggleEstadoUsuario = async (u: UsuarioItem) => {
    const nuevoEstado = !u.activo;
    const accion = nuevoEstado ? 'reactivar' : 'suspender';
    if (!window.confirm(`¿Deseas ${accion} el acceso de ${u.nombre_completo}?`)) {
      return;
    }

    try {
      setProcesandoUsuarioId(u.id);
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id, activo: nuevoEstado }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo actualizar el estado del usuario.');
      }
      sileo.success({
        title: nuevoEstado ? 'Usuario reactivado' : 'Usuario suspendido',
        description: data.mensaje || `El estado de ${u.nombre_completo} fue actualizado.`,
      });
      cargarUsuarios();
    } catch (err: unknown) {
      sileo.error({
        title: 'Error al actualizar',
        description: obtenerMensajeError(err, 'No se pudo cambiar el estado del usuario.'),
      });
    } finally {
      setProcesandoUsuarioId(null);
    }
  };

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

      // Limpiar y volver a lista
      setNombreCompleto('');
      setEmail('');
      setPassword('');
      setTelefono('');
      setRol('cajero');
      setPermisosSeleccionados(['cobros.crear', 'tomas.ver', 'personas.ver']);
      setVista('lista');

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

  if (vista === 'formulario') {
    return (
      <div className="w-full space-y-8 animate-in fade-in duration-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setVista('lista')}
              className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors py-1 px-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a Usuarios y Permisos</span>
            </button>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
              <span className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                <UserPlus className="w-6 h-6" />
              </span>
              <span>Registrar Nuevo Usuario</span>
            </h2>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Asigna credenciales, rol y permisos en tu organización.
            </p>
          </div>
        </div>

        {/* Formulario a lo ancho completo (EJE X) sin contenedor Card ni modal */}
        <form onSubmit={handleSubmit} className="w-full space-y-8">
          {/* Bloque 1: Credenciales y Datos Personales */}
          <div className="space-y-4">
            <div className="border-b border-slate-200/80 dark:border-slate-800 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                <span>Datos del Usuario</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <Input
                label="Nombre Completo *"
                placeholder="Ej: Juan Pérez Martínez"
                value={nombreCompleto}
                onChange={(e) => setNombreCompleto(e.target.value)}
                required
              />

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
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
          </div>

          {/* Bloque 2: Permisos de Acceso */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-500" />
                <span>Permisos de Acceso</span>
              </h3>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
          <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-200/80 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setVista('lista')}
              disabled={guardando}
            >
              Cancelar
            </Button>

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={guardando}
              icon={<UserPlus className="w-4 h-4" />}
            >
              {guardando ? 'Guardando...' : 'Crear Usuario'}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-300">
      {/* Encabezado de la página */}
      <PageHeader
        icon={<ShieldCheck />}
        tone="blue"
        title="Usuarios y Permisos"
        subtitle="Gestiona los administradores y cajeros autorizados para operar el sistema."
        status="Control de acceso comunitario"
        action={
          <>
            <Button
              variant="outline"
              size="md"
              onClick={cargarUsuarios}
              disabled={cargando}
              icon={
                <RefreshCw
                  className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`}
                />
              }
            >
              Actualizar
            </Button>

            <Button
              variant="primary"
              size="md"
              onClick={() => setVista('formulario')}
              icon={<UserPlus className="w-4 h-4" />}
            >
              Nuevo Usuario
            </Button>
          </>
        }
      />

      {/* Tabla de Usuarios */}
      <Table>
        <TableHeader>
          <tr>
            <TableHead>Usuario</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Permisos Asignados</TableHead>
            <TableHead>Conexión</TableHead>
            <TableHead>Última Conexión</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {cargando ? (
            <TableRow elevate={false}>
              <TableCell colSpan={6} className="py-12 text-center text-slate-500">
                <div className="flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="text-xs font-medium">Cargando usuarios...</span>
                </div>
              </TableCell>
            </TableRow>
          ) : usuarios.length === 0 ? (
            <TableRow elevate={false}>
              <TableCell colSpan={6} className="py-12 text-center text-slate-500">
                <Users className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  No hay usuarios registrados
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Haz clic en &quot;Nuevo Usuario&quot; para agregar al primer cajero.
                </p>
              </TableCell>
            </TableRow>
          ) : (
            usuarios.map((u) => {
              const esAdmin = u.rol === 'administrador';
              const isOnline = onlineUserIds.has(u.id);
              const iniciales = u.nombre_completo
                .split(' ')
                .slice(0, 2)
                .map((n) => n[0])
                .join('')
                .toUpperCase();

              return (
                <TableRow key={u.id}>
                  {/* Datos del Usuario */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-sm shadow-sm">
                          {iniciales || 'U'}
                        </div>
                        {isOnline && (
                          <span
                            title="En línea"
                            className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full shadow-xs"
                          />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-900 dark:text-white">
                            {u.nombre_completo}
                          </p>
                          {!u.activo && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              Suspendido
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3" />
                          {u.email || 'Sin correo asociado'}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  {/* Rol */}
                  <TableCell>
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
                  </TableCell>

                  {/* Permisos */}
                  <TableCell className="max-w-xs">
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
                  </TableCell>

                  {/* Conexión en vivo */}
                  <TableCell>
                    {isOnline ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        En línea
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20">
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                        Desconectado
                      </span>
                    )}
                  </TableCell>

                  {/* Última Conexión */}
                  <TableCell className="text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span className={isOnline ? 'font-bold text-emerald-600 dark:text-emerald-400' : ''}>
                        {formatearUltimaConexion(u.ultima_conexion, isOnline)}
                      </span>
                    </span>
                  </TableCell>

                  {/* Acciones */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setModalActividadCajeroId(u.id);
                          setModalActividadCajeroNombre(u.nombre_completo);
                        }}
                        className="p-1.5 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                        title="Ver cobros y recibos emitidos"
                      >
                        <Receipt className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setUsuarioAEditar(u)}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                        title="Editar datos, rol y permisos"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        disabled={procesandoUsuarioId === u.id}
                        onClick={() => handleToggleEstadoUsuario(u)}
                        className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                          u.activo
                            ? 'text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                            : 'text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                        }`}
                        title={u.activo ? 'Suspender acceso del usuario' : 'Reactivar acceso del usuario'}
                      >
                        {u.activo ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>

                      <button
                        type="button"
                        disabled={procesandoUsuarioId === u.id}
                        onClick={() => handleEliminarUsuario(u)}
                        className="p-1.5 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-50"
                        title="Eliminar usuario permanentemente"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Modal de auditoría de actividad y recibos del cajero */}
      {modalActividadCajeroId && (
        <ModalActividadCajero
          cajeroId={modalActividadCajeroId}
          cajeroNombre={modalActividadCajeroNombre}
          isOnline={onlineUserIds.has(modalActividadCajeroId)}
          onClose={() => {
            setModalActividadCajeroId(null);
            setModalActividadCajeroNombre('');
          }}
        />
      )}

      {/* Modal de edición de usuario y permisos */}
      {usuarioAEditar && (
        <ModalEditarUsuario
          usuario={usuarioAEditar}
          onClose={() => setUsuarioAEditar(null)}
          onUsuarioActualizado={cargarUsuarios}
        />
      )}

    </div>
  );
}
