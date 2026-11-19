import type { Metadata } from "next";
import {
  LegalPageShell,
  LegalSection,
} from "@/components/legal/legal-page";
import {
  BRAND_LEGAL_NAME,
  BRAND_NAME,
  BRAND_PRIVACY_EMAIL,
  BRAND_SUPPORT_EMAIL,
  BRAND_TERMS_PATH,
} from "@/lib/brand";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: `Cómo ${BRAND_NAME} trata los datos personales de clientes, usuarios y contactos.`,
};

const UPDATED_AT = "18 de noviembre de 2026";

export default function PrivacidadPage() {
  return (
    <LegalPageShell title="Política de privacidad" updatedAt={UPDATED_AT}>
      <LegalSection title="1. Responsable">
        <p>
          El responsable del tratamiento de los datos personales tratados a
          través de la plataforma {BRAND_NAME} es {BRAND_LEGAL_NAME} (en
          adelante, “nosotros”, “el Prestador” o “{BRAND_NAME}”).
        </p>
        <p>
          Para consultas sobre privacidad:{" "}
          <a
            className="text-[var(--primary)] underline-offset-2 hover:underline"
            href={`mailto:${BRAND_PRIVACY_EMAIL}`}
          >
            {BRAND_PRIVACY_EMAIL}
          </a>
          . Soporte general:{" "}
          <a
            className="text-[var(--primary)] underline-offset-2 hover:underline"
            href={`mailto:${BRAND_SUPPORT_EMAIL}`}
          >
            {BRAND_SUPPORT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="2. Alcance y roles">
        <p>
          {BRAND_NAME} es un software de gestión inmobiliaria (SaaS). Según el
          caso:
        </p>
        <ul>
          <li>
            <strong>Datos de la cuenta del Cliente</strong> (inmobiliaria u
            organización suscripta): somos responsables del tratamiento.
          </li>
          <li>
            <strong>Datos de la cartera del Cliente</strong> (propietarios,
            inquilinos, garantes, prospectos, proveedores y demás personas que
            el Cliente carga o recibe en el sistema): tratamos esos datos como{" "}
            <strong>encargados del tratamiento</strong>, por cuenta e
            instrucción del Cliente, quien actúa como responsable frente a esos
            titulares.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Datos que recopilamos">
        <p>Podemos tratar, entre otros:</p>
        <ul>
          <li>
            <strong>Cuenta y facturación:</strong> nombre, correo, teléfono,
            rol, datos de la organización, CUIT u otros identificadores
            fiscales, plan contratado e historial de pagos.
          </li>
          <li>
            <strong>Uso del servicio:</strong> registros de acceso, IP, user
            agent, eventos de seguridad y logs técnicos necesarios para operar
            y auditar la plataforma.
          </li>
          <li>
            <strong>Contenido operativo del Cliente:</strong> datos de
            propiedades, contratos, cobros, rendiciones, mantenimiento, agenda,
            documentos adjuntos y demás información que el Cliente o sus
            usuarios carguen.
          </li>
          <li>
            <strong>Mensajería (si el Cliente conecta WhatsApp u otros
            canales):</strong>{" "}
            identificadores de cuenta comercial, tokens de acceso protegidos,
            número de línea, mensajes entrantes/salientes, estados de entrega o
            lectura y datos de perfil que el proveedor del canal (p. ej. Meta
            Platforms) exponga para prestar el servicio.
          </li>
          <li>
            <strong>Portal público / leads:</strong> nombre, correo, teléfono y
            mensaje que un visitante envíe al consultar una propiedad publicada
            por una inmobiliaria.
          </li>
        </ul>
        <p>
          No vendemos datos personales ni los utilizamos para publicidad de
          terceros.
        </p>
      </LegalSection>

      <LegalSection title="4. Finalidades">
        <ul>
          <li>Prestar, mantener y mejorar el Servicio.</li>
          <li>Autenticar usuarios y administrar permisos por organización.</li>
          <li>Facturar, cobrar y gestionar la relación contractual.</li>
          <li>
            Enviar comunicaciones operativas (avisos de servicio, seguridad,
            cambios relevantes).
          </li>
          <li>
            Cumplir obligaciones legales y responder requerimientos de
            autoridad competente.
          </li>
          <li>
            Respecto de la cartera del Cliente: únicamente ejecutar el software
            y las funciones contratadas (incluyendo mensajería cuando esté
            habilitada), según sus instrucciones.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. WhatsApp, Meta y canales de mensajería">
        <p>
          Si el Cliente conecta WhatsApp Business (u otros productos de Meta),{" "}
          {BRAND_NAME} actúa como proveedor tecnológico. Recibimos de Meta los
          datos necesarios para operar la cuenta en nombre del Cliente. Los
          mensajes se transmiten a través de las APIs de Meta, sujetas a sus
          propias políticas.
        </p>
        <p>
          El Cliente es responsable de obtener el consentimiento (opt-in) de
          los destinatarios y de cumplir las políticas de Meta / WhatsApp. Puede
          revocar el acceso desconectando la integración en {BRAND_NAME} o desde
          la configuración de su cuenta comercial en Meta.
        </p>
      </LegalSection>

      <LegalSection title="6. Base legal">
        <p>
          Tratamos datos conforme a la Ley 25.326 de Protección de los Datos
          Personales (Argentina) y normas complementarias, sobre la base de:
          ejecución de contrato, interés legítimo en la seguridad y mejora del
          servicio, consentimiento cuando corresponda, y cumplimiento de
          obligaciones legales.
        </p>
      </LegalSection>

      <LegalSection title="7. Encargados y alojamiento">
        <p>
          Podemos recurrir a proveedores de infraestructura (por ejemplo,
          hosting en la nube, correo transaccional, pasarelas de pago o
          proveedores de mensajería) que tratan datos solo para prestarnos el
          servicio. Aplicamos medidas razonables de confidencialidad y seguridad
          contractual.
        </p>
        <p>
          Los datos de cada organización se mantienen lógicamente separados de
          los de otras organizaciones (multi-tenant).
        </p>
      </LegalSection>

      <LegalSection title="8. Conservación">
        <ul>
          <li>
            Datos de cuenta y contenido operativo: mientras la suscripción esté
            activa y el tiempo adicional necesario para cierre, respaldo o
            reclamos.
          </li>
          <li>
            Datos de facturación: el plazo exigido por normativa fiscal y
            contable aplicable.
          </li>
          <li>
            Logs técnicos y de seguridad: generalmente hasta 12 meses, salvo
            necesidad de investigación.
          </li>
          <li>
            Copias de seguridad: se rotan/sobrescriben en ciclos habituales de
            infraestructura.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="9. Seguridad">
        <p>
          Aplicamos medidas técnicas y organizativas razonables: cifrado en
          tránsito (TLS), control de acceso por roles, separación por
          organización y prácticas de minimización. Ningún sistema es 100 %
          seguro. Ante un incidente relevante que afecte datos personales, lo
          notificaremos a los afectados y/o autoridades cuando corresponda.
        </p>
      </LegalSection>

      <LegalSection title="10. Derechos de los titulares">
        <p>
          Los titulares pueden solicitar acceso, rectificación, actualización o
          eliminación de sus datos, y oponerse a tratamientos indebidos, en los
          términos de la normativa aplicable.
        </p>
        <ul>
          <li>
            Si sos usuario de una inmobiliaria cliente: también podés ejercer
            derechos ante esa inmobiliaria, que es responsable de tu relación
            contractual o comercial.
          </li>
          <li>
            Para ejercer derechos frente a {BRAND_NAME}: escribinos a{" "}
            <a
              className="text-[var(--primary)] underline-offset-2 hover:underline"
              href={`mailto:${BRAND_PRIVACY_EMAIL}`}
            >
              {BRAND_PRIVACY_EMAIL}
            </a>
            .
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="11. Cookies y tecnologías similares">
        <p>
          Usamos cookies y almacenamiento local necesarios para sesión,
          seguridad y preferencias básicas. No utilizamos cookies de publicidad
          de terceros en el panel del ERP.
        </p>
      </LegalSection>

      <LegalSection title="12. Menores">
        <p>
          El Servicio está dirigido a empresas y profesionales. No recopilamos
          de forma intencional datos de menores de 18 años.
        </p>
      </LegalSection>

      <LegalSection title="13. Cambios">
        <p>
          Podemos actualizar esta política. La fecha de “última actualización”
          indica la versión vigente. El uso continuado del Servicio después de
          cambios relevantes implica conocimiento de la nueva versión, sin
          perjuicio de avisos adicionales cuando la ley lo requiera.
        </p>
      </LegalSection>

      <LegalSection title="14. Condiciones del servicio">
        <p>
          El uso de {BRAND_NAME} también se rige por las{" "}
          <a
            className="text-[var(--primary)] underline-offset-2 hover:underline"
            href={BRAND_TERMS_PATH}
          >
            Condiciones del servicio
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
