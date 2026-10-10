export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return res.status(400).json({ error: 'Validation failed', details });
    }

    if (source === 'body') {
      req.body = result.data;
    } else {
      req.validated = { ...req.validated, [source]: result.data };
    }
    next();
  };
}
