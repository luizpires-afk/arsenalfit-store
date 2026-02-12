import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Affiliates = () => {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Afiliados & Transparência — ArsenalFit";
    let metaDescription = document.querySelector(
      'meta[name="description"]'
    ) as HTMLMetaElement | null;
    if (!metaDescription) {
      metaDescription = document.createElement("meta");
      metaDescription.name = "description";
      document.head.appendChild(metaDescription);
    }
    metaDescription.content =
      "Entenda como o ArsenalFit usa links de afiliados (Mercado Livre) e nossa política de transparência: você economiza sem custo adicional.";
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
          Afiliados & Transparência Comercial — ArsenalFit
        </h1>
        <p className="text-sm text-zinc-500 mb-8">
          Última atualização: 11 de Fevereiro de 2026
        </p>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">1. Nossa proposta</h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            O ArsenalFit existe para facilitar escolhas inteligentes: fazemos
            curadoria de produtos e monitoramos preços para destacar
            oportunidades com excelente custo-benefício, sempre com foco em
            praticidade e economia.
          </p>
        </section>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">
            2. Como funcionam os links de afiliados
          </h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            Alguns links exibidos no ArsenalFit podem direcionar para parceiros
            e marketplaces — incluindo o <strong>Mercado Livre</strong>. Quando
            você acessa um produto por esses links e realiza uma compra, o
            ArsenalFit pode receber uma comissão do parceiro.
          </p>
        </section>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">3. Sem custo adicional para você</h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            Essa comissão <strong>não gera custo extra</strong> ao usuário. O
            valor é pago pelo parceiro/maketplace e ajuda a manter o projeto,
            melhorar o monitoramento e ampliar a curadoria de produtos.
          </p>
        </section>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">4. Independência editorial</h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            Nosso compromisso é com a transparência e com a utilidade. A
            curadoria e o destaque de ofertas consideram preço, relevância e
            contexto. Participar de programas de afiliados não significa
            favorecer produtos de baixa qualidade — nosso objetivo é maximizar
            valor para o usuário.
          </p>
        </section>

        <section className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">5. Variação de preços e disponibilidade</h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            Como os preços são fornecidos por terceiros e podem mudar em tempo
            real, o valor final exibido no site do parceiro pode variar.
            Recomendamos confirmar preço e condições diretamente no Mercado
            Livre no momento da compra.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">6. Contato</h2>
          <p className="text-base leading-relaxed text-zinc-800 max-[420px]:text-[15px]">
            Se tiver dúvidas sobre afiliados ou transparência comercial, fale
            conosco: <strong>powershop.bras@gmail.com</strong>
          </p>
        </section>
      </div>
    </main>
  );
};

export default Affiliates;
