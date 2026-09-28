using System.Security.Claims;
using IStreamsCrm.Api.DTOs;

namespace IStreamsCrm.Api.Services;

public static class CurrentUserExtensions
{
    public static int UserId(this ClaimsPrincipal user) =>
        int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);

    // Every query is scoped by this, so one company can never see another's data.
    public static int CompanyId(this ClaimsPrincipal user) =>
        int.Parse(user.FindFirstValue(TokenService.CompanyClaim)!);

    public static bool IsAdmin(this ClaimsPrincipal user) => user.IsInRole(Roles.Admin);
}
