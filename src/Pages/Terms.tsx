import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Terms = () => {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Termos de Uso — ArsenalFit";
    let metaDescription = document.querySelector(
      'meta[name="description"]'
    ) as HTMLMetaElement | null;
    if (!metaDescription) {
      metaDescription = document.createElement("meta");
      metaDescription.name = "description";
      document.head.appendChild(metaDescription);
    }
    metaDescription.content =
      "Termos de Uso do ArsenalFit: condições para uso da plataforma, curadoria de produtos, limitações de responsabilidade e regras gerais.";
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
          Termos de Uso — ArsenalFit
        </h1>
        <p className="text-sm text-zinc-500 mb-8">
          Última atualização: 11 de Fevereiro de 2026
        </p>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">1. Aceitação dos Termos</h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            Ao acessar, navegar, cadastrar-se ou utilizar o ArsenalFit, você
            declara que leu, entendeu e concorda com estes Termos de Uso. Caso
            não concorde, recomendamos que não utilize a plataforma.
          </p>
        </section>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">2. O que é o ArsenalFit</h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            O ArsenalFit é uma plataforma de <strong>curadoria de produtos</strong>{" "}
            voltados ao universo fitness, com foco em{" "}
            <strong>monitoramento de preços</strong> e apresentação de
            oportunidades de compra em parceiros e marketplaces.
          </p>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            O ArsenalFit <strong>não comercializa produtos diretamente</strong>.
            As compras são concluídas em sites de terceiros, como o{" "}
            <strong>Mercado Livre</strong>, seguindo as políticas e condições
            desses fornecedores.
          </p>
        </section>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">3. Cadastro e Conta</h2>
          <ul className="list-disc pl-5 space-y-2 text-base text-zinc-800 max-[420px]:text-[15px]">
            <li>
              Você se compromete a fornecer informações verdadeiras, completas e
              atualizadas ao criar uma conta.
            </li>
            <li>
              Sua conta é pessoal e intransferível. Você é responsável por
              manter a confidencialidade de sua senha.
            </li>
            <li>
              Podemos suspender ou encerrar contas que violem estes Termos, a
              legislação aplicável ou a segurança da plataforma.
            </li>
          </ul>
        </section>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">
            4. Preços, Disponibilidade e Atualizações
          </h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            Os preços e condições exibidos no ArsenalFit podem sofrer alterações
            a qualquer momento, pois dependem de dados e atualizações do
            marketplace/parceiro. Apesar do nosso esforço para manter
            informações atualizadas, <strong>não garantimos</strong> que o
            valor exibido na plataforma será o mesmo no momento da compra no
            site do parceiro.
          </p>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            A disponibilidade de estoque, prazo de entrega, garantia e políticas
            de troca/devolução são de responsabilidade do fornecedor.
          </p>
        </section>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">5. Links para Terceiros</h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            A plataforma pode conter links que direcionam para sites de terceiros
            (ex.: Mercado Livre). Ao clicar nesses links, você estará sujeito
            aos termos e políticas do site de destino. O ArsenalFit não controla
            e não se responsabiliza pelo conteúdo, práticas ou serviços desses
            sites.
          </p>
        </section>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">
            6. Limitação de Responsabilidade
          </h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            O ArsenalFit não se responsabiliza por quaisquer danos diretos ou
            indiretos relacionados a compras realizadas em sites de terceiros,
            incluindo (sem limitar) problemas de entrega, qualidade do produto,
            garantias, suporte, cobranças, trocas ou devoluções.
          </p>
        </section>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">7. Propriedade Intelectual</h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            Todo o conteúdo do ArsenalFit (marca, identidade visual, textos e
            estrutura) é protegido por direitos de propriedade intelectual. É
            proibida a reprodução ou uso indevido sem autorização.
          </p>
        </section>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">8. Alterações destes Termos</h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            Podemos atualizar estes Termos de Uso periodicamente para refletir
            melhorias na plataforma ou alterações legais/operacionais. A data de
            “Última atualização” no topo indica a versão vigente.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">9. Contato</h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            Em caso de dúvidas sobre estes Termos de Uso, fale conosco:{" "}
            <strong>powershop.bras@gmail.com</strong>
          </p>
        </section>
      </div>
    </main>
  );
};

export default Terms;
