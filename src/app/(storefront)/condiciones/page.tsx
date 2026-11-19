import type { Metadata } from "next";
import {
  LegalPageShell,
  LegalSection,
} from "@/components/legal/legal-page";
import {
  BRAND_LEGAL_NAME,
  BRAND_NAME,
  BRAND_PRIVACY_PATH,
  BRAND_SUPPORT_EMAIL,
} from "@/lib/brand";

export const metadata: Metadata = {
  title: "Condiciones del servicio",
  description: `Términos y condiciones de uso de la plataforma ${BRAND_NAME}.`,
};

const UPDATED_AT = "18 de noviembre de 2026";

export default function CondicionesPage() {
  return (
    <LegalPageShell title="Condiciones del servicio" updatedAt={UPDATED_AT}>
      <LegalSection title="1. Aceptación">
        <p>
          Estas Condiciones del servicio (“Condiciones”) regulan el acceso y uso
          de la plataforma {BRAND_NAME}, operada por {BRAND_LEGAL_NAME} (“el
          Prestador”). Al crear una cuenta, contratar un plan o usar el
          Servicio, el Cliente acepta estas Condiciones y la{" "}
          <a
            className="text-[var(--primary)] underline-offset-2 hover:underline"
            href={BRAND_PRIVACY_PATH}
          >
            Política de privacidad
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="2. Descripción del Servicio">
        <p>
          {BRAND_NAME} es un software en la nube para la gestión inmobiliaria
          (propiedades, contratos, cobros, tesorería, mantenimiento, portal
          público, mensajería y funciones relacionadas, según el plan
          contratado). El Prestador puede mejorar, modificar o discontinuar
          funcionalidades con aviso razonable cuando el cambio sea material.
        </p>
      </LegalSection>

      <LegalSection title="3. Cuenta y usuarios">
        <ul>
          <li>
            El Cliente es responsable de la veracidad de los datos de alta y de
            la actividad de sus usuarios.
          </li>
          <li>
            Debe mantener confidenciales las credenciales y notificar usos no
            autorizados.
          </li>
          <li>
            El acceso se otorga por organización (empresa) y roles/permisos
            configurados por el Cliente.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Planes, pagos y suspensión">
        <p>
          El acceso a funciones puede depender del plan vigente y del estado de
          pago. La falta de pago o el incumplimiento grave puede generar
          suspensión o limitación del Servicio hasta regularizar la situación,
          sin perjuicio de cobros pendientes.
        </p>
      </LegalSection>

      <LegalSection title="5. Contenido y datos del Cliente">
        <p>
          El Cliente conserva la titularidad sobre los datos y archivos que
          carga. Otorga al Prestador una licencia limitada para alojar,
          procesar y mostrar ese contenido solo en la medida necesaria para
          prestar el Servicio.
        </p>
        <p>
          El Cliente garantiza que tiene derecho a cargar y tratar esos datos
          (incluida la base de propietarios, inquilinos, garantes, leads y
          documentos) y que cumple la normativa de protección de datos
          aplicable.
        </p>
      </LegalSection>

      <LegalSection title="6. Uso aceptable">
        <p>El Cliente se obliga a no:</p>
        <ul>
          <li>Usar el Servicio para fines ilícitos o fraudulentos.</li>
          <li>
            Intentar vulnerar seguridad, acceder a datos de otras organizaciones
            o interferir con la plataforma.
          </li>
          <li>
            Enviar comunicaciones no solicitadas o abusivas a través de canales
            conectados (incluida mensajería).
          </li>
          <li>
            Revender el Servicio sin autorización escrita del Prestador.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="7. WhatsApp Business y Meta Platforms">
        <p>
          Cuando el Cliente habilita integraciones con WhatsApp Business u otros
          productos de Meta Platforms Inc.:
        </p>
        <ul>
          <li>
            La línea, la cuenta comercial y las credenciales son del Cliente.{" "}
            {BRAND_NAME} actúa como proveedor tecnológico para enviar/recibir
            mensajes en su nombre.
          </li>
          <li>
            El Cliente debe cumplir las políticas vigentes de Meta / WhatsApp
            (incluido el consentimiento previo/opt-in, ventanas de mensajería y
            uso de plantillas aprobadas cuando corresponda).
          </li>
          <li>
            El Cliente es el único responsable del contenido de los mensajes y
            de las automatizaciones que active.
          </li>
          <li>
            El Prestador no responde por suspensiones, límites de calidad,
            bloqueos, rechazos de plantillas, cambios de políticas o costos de
            mensajería impuestos por Meta u otros proveedores del canal.
          </li>
          <li>
            Los costos de conversación/mensajería facturados por Meta (o por el
            proveedor intermediario) son a cargo del Cliente, salvo pacto
            escrito en contrario.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="8. Portal público y leads">
        <p>
          El Cliente puede publicar un catálogo público bajo su propio enlace.
          Es responsable del contenido publicado y del tratamiento de las
          consultas (leads) que reciba a través de ese canal.
        </p>
      </LegalSection>

      <LegalSection title="9. Disponibilidad y soporte">
        <p>
          Procuramos una disponibilidad razonable del Servicio, sin garantizar
          un uptime ininterrumpido. Puede haber mantenimientos, incidentes de
          terceros (hosting, redes, Meta, bancos, etc.) o fuerza mayor. El
          soporte se brinda por los canales indicados en la cuenta o a{" "}
          <a
            className="text-[var(--primary)] underline-offset-2 hover:underline"
            href={`mailto:${BRAND_SUPPORT_EMAIL}`}
          >
            {BRAND_SUPPORT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="10. Propiedad intelectual">
        <p>
          El software, marcas, diseños y documentación de {BRAND_NAME} son
          propiedad del Prestador o de sus licenciantes. El Cliente recibe un
          derecho de uso no exclusivo, intransferible y limitado al plazo de la
          suscripción.
        </p>
      </LegalSection>

      <LegalSection title="11. Confidencialidad">
        <p>
          Cada parte se obliga a no divulgar información confidencial de la otra
          obtenida en el marco del Servicio, salvo obligación legal o
          necesidad operativa con terceros bajo deber de confidencialidad.
        </p>
      </LegalSection>

      <LegalSection title="12. Limitación de responsabilidad">
        <p>
          En la máxima medida permitida por la ley aplicable, el Prestador no
          será responsable por daños indirectos, lucro cesante, pérdida de
          datos del Cliente atribuible a causas ajenas al Prestador, ni por
          decisiones comerciales tomadas sobre la base de información cargada o
          generada en el sistema.
        </p>
        <p>
          La responsabilidad total del Prestador frente al Cliente por
          reclamos relacionados con el Servicio en un período de doce (12)
          meses no excederá, en conjunto, el monto efectivamente abonado por el
          Cliente al Prestador por el Servicio en esos doce meses, salvo dolo o
          culpa grave.
        </p>
      </LegalSection>

      <LegalSection title="13. Terminación">
        <p>
          El Cliente puede dejar de usar el Servicio y/o solicitar la baja
          según el plan. El Prestador puede suspender o terminar el acceso ante
          incumplimiento material no subsanado. Tras la baja, se podrá
          conservar información el tiempo necesario por obligaciones legales o
          defensa de derechos, conforme la Política de privacidad.
        </p>
      </LegalSection>

      <LegalSection title="14. Modificaciones">
        <p>
          Podemos actualizar estas Condiciones. Publicaremos la versión vigente
          en esta URL con su fecha de actualización. Si el cambio es
          sustancial, podremos notificarlo por medios razonables.
        </p>
      </LegalSection>

      <LegalSection title="15. Ley y jurisdicción">
        <p>
          Estas Condiciones se rigen por las leyes de la República Argentina.
          Salvo norma imperativa en contrario, quedan sometidas a los
          tribunales ordinarios de la Ciudad Autónoma de Buenos Aires.
        </p>
      </LegalSection>

      <LegalSection title="16. Contacto">
        <p>
          Consultas sobre estas Condiciones:{" "}
          <a
            className="text-[var(--primary)] underline-offset-2 hover:underline"
            href={`mailto:${BRAND_SUPPORT_EMAIL}`}
          >
            {BRAND_SUPPORT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
