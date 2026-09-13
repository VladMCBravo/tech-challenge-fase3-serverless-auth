const { Client } = require('pg');
const jwt = require('jsonwebtoken');

// Remove tudo que não for dígito ("529.982.247-25" -> "52998224725")
function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

// Validação real do CPF (dígitos verificadores) — exigido: "Validar o CPF do cliente"
function isValidCpf(cpf) {
  cpf = onlyDigits(cpf);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // rejeita 111.111.111-11 etc.

  const calcCheck = (base, factorStart) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += parseInt(base[i], 10) * (factorStart - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const d1 = calcCheck(cpf.slice(0, 9), 10);
  const d2 = calcCheck(cpf.slice(0, 10), 11);
  return d1 === parseInt(cpf[9], 10) && d2 === parseInt(cpf[10], 10);
}

exports.handler = async (event) => {
  let client;
  try {
    // 1. Ler o CPF do corpo da requisição
    const body = JSON.parse(event.body || '{}');
    const cpf = onlyDigits(body.cpf);

    if (!cpf) {
      return resp(400, { message: 'CPF é obrigatório' });
    }

    // 2. Validar o formato do CPF antes de ir ao banco
    if (!isValidCpf(cpf)) {
      return resp(400, { message: 'CPF inválido' });
    }

    // 3. Conectar ao banco (RDS)
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    // 4. Consultar existência e STATUS do cliente
    //    ATENÇÃO: no schema Prisma a tabela é "customers" (@@map) e o CPF é a coluna "document".
    //    "isActive" é camelCase, então precisa de aspas duplas no PostgreSQL.
    const query =
      'SELECT id, name, document, "isActive" FROM customers WHERE document = $1';
    const res = await client.query(query, [cpf]);

    if (res.rows.length === 0) {
      return resp(404, { message: 'Cliente não encontrado' });
    }

    const customer = res.rows[0];

    // 5. Checar o status do cliente (inativo não recebe token)
    if (customer.isActive === false) {
      return resp(403, { message: 'Cliente inativo' });
    }

    // 6. Gerar o token JWT válido para consumir as APIs protegidas
    const token = jwt.sign(
      {
        sub: customer.id,
        cpf: customer.document,
        name: customer.name,
        role: 'cliente',
      },
      process.env.JWT_SECRET || 'segredo-super-seguro-fiap',
      { expiresIn: '2h' },
    );

    return resp(200, {
      message: 'Autenticação realizada com sucesso',
      token,
    });
  } catch (error) {
    console.error('Erro na autenticação:', error);
    return resp(500, { message: 'Erro interno no servidor', error: error.message });
  } finally {
    if (client) {
      try {
        await client.end();
      } catch (_) {
        /* ignore */
      }
    }
  }
};

function resp(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}