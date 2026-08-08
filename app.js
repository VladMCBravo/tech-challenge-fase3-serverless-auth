const { Client } = require('pg');
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
    try {
        // 1. Fazer o parse do body (onde virá o CPF)
        const body = JSON.parse(event.body || '{}');
        const cpf = body.cpf;

        if (!cpf) {
            return { statusCode: 400, body: JSON.stringify({ message: 'CPF é obrigatório' }) };
        }

        // 2. Conectar à Base de Dados (as variáveis virão do ambiente)
        const client = new Client({
            connectionString: process.env.DATABASE_URL
        });
        await client.connect();

        // 3. Consultar o Cliente na Base de Dados (ajuste o nome da tabela/coluna conforme o seu Prisma schema)
        // Usando aspas duplas para garantir que o Postgres entende o nome da tabela caso tenha letras maiúsculas
        const res = await client.query('SELECT id, name, cpf FROM "Customer" WHERE cpf = $1', [cpf]);
        await client.end();

        if (res.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ message: 'Cliente não encontrado' }) };
        }

        const customer = res.rows[0];

        // 4. Gerar o Token JWT
        const token = jwt.sign(
            { 
                sub: customer.id, 
                cpf: customer.cpf, 
                role: 'cliente' 
            },
            process.env.JWT_SECRET || 'segredo-super-seguro-fiap',
            { expiresIn: '2h' }
        );

        // 5. Devolver o Token
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Autenticação realizada com sucesso',
                token: token
            })
        };

    } catch (error) {
        console.error("Erro na autenticação:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Erro interno no servidor', error: error.message })
        };
    }
};