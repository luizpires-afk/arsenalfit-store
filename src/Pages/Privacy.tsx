import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Privacy = () => {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Política de Privacidade — ArsenalFit";
    let metaDescription = document.querySelector(
      'meta[name="description"]'
    ) as HTMLMetaElement | null;
    if (!metaDescription) {
      metaDescription = document.createElement("meta");
      metaDescription.name = "description";
      document.head.appendChild(metaDescription);
    }
    metaDescription.content =
      "Saiba como o ArsenalFit coleta, usa e protege seus dados. Política de Privacidade clara e objetiva.";
  }, []);

  return (
    <main className="min-h-screen bg-white text-zinc-900">
      <div className="mx-auto max-w-3xl px-4 pt-12 pb-6 legal-page max-[420px]:pt-[28px] max-[420px]:pb-[18px]">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600 hover:border-[#ff7a00]/60 hover:text-[#ff7a00] transition-colors"
        >
          Voltar
        </button>
        <h1 className="text-[34px] leading-tight font-black mb-2 max-[420px]:text-[26px]">
          Política de Privacidade — ArsenalFit
        </h1>
        <p className="text-sm text-zinc-500 mb-8">
          Última atualização: 11 de Fevereiro de 2026
        </p>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">1. Visão Geral</h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            A sua privacidade é importante para nós. Esta Política descreve como
            o ArsenalFit coleta, utiliza, armazena e protege dados pessoais,
            sempre com foco em transparência e segurança.
          </p>
        </section>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">2. Quais dados coletamos</h2>
          <ul className="list-disc pl-5 space-y-2 text-base text-zinc-800 max-[420px]:text-[15px]">
            <li>
              <strong>Dados de cadastro:</strong> como nome e e-mail (quando
              você cria uma conta).
            </li>
            <li>
              <strong>Dados de uso:</strong> páginas acessadas, cliques e
              interações, para melhoria da experiência.
            </li>
            <li>
              <strong>Dados técnicos:</strong> IP, navegador, dispositivo e
              cookies (quando aplicável).
            </li>
          </ul>
        </section>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">3. Como usamos seus dados</h2>
          <ul className="list-disc pl-5 space-y-2 text-base text-zinc-800 max-[420px]:text-[15px]">
            <li>Permitir acesso à conta e funcionalidades da plataforma.</li>
            <li>
              Melhorar a experiência, a performance e a qualidade da curadoria.
            </li>
            <li>
              Realizar análises internas para entender preferências e
              comportamento de navegação.
            </li>
            <li>
              Garantir segurança, prevenir fraudes e proteger a integridade da
              plataforma.
            </li>
          </ul>
        </section>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">4. Compartilhamento de dados</h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            O ArsenalFit <strong>não vende</strong> seus dados pessoais. Podemos
            compartilhar dados de forma limitada com provedores de serviço
            essenciais para operar a plataforma (por exemplo, serviços de
            hospedagem, autenticação e ferramentas de análise), sempre
            respeitando boas práticas de segurança.
          </p>
        </section>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">5. Cookies e tecnologias similares</h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            Podemos utilizar cookies para melhorar a navegação, lembrar
            preferências e gerar métricas de uso. Você pode gerenciar o uso de
            cookies nas configurações do seu navegador. Dependendo das
            configurações, algumas funcionalidades podem não operar
            corretamente.
          </p>
        </section>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">6. Segurança da informação</h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            Adotamos medidas técnicas e organizacionais para proteger seus
            dados. Ainda assim, nenhum sistema é 100% infalível. Em caso de
            dúvidas sobre segurança, entre em contato conosco.
          </p>
        </section>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">7. Seus direitos e solicitações</h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            Você pode solicitar acesso, correção, atualização ou exclusão de
            dados pessoais relacionados à sua conta, conforme aplicável. Para
            solicitações, utilize nosso canal de contato.
          </p>
        </section>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">8. Retenção de dados</h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            Mantemos dados apenas pelo tempo necessário para cumprir as
            finalidades descritas nesta Política, incluindo obrigações legais,
            segurança e prevenção a fraudes.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">9. Contato</h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            Para dúvidas sobre privacidade, solicitações ou informações
            adicionais, fale conosco: <strong>powershop.bras@gmail.com</strong>
          </p>
        </section>
      </div>
    </main>
  );
};

export default Privacy;
