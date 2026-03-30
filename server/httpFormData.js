export async function parseRequestFormData(req) {
  const request = new Request('http://127.0.0.1', {
    body: req,
    duplex: 'half',
    headers: req.headers,
    method: req.method,
  })

  return request.formData()
}
